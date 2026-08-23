import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { WorkProfile, WorkTask } from '@agentlings/shared';

/**
 * Source adapters: a real-world job record in, a `WorkProfile` out. Each
 * adapter knows one source's files and nothing about the grader or the
 * screens; everything past this file reads the normalised shape only, so a
 * source is a swap here and nowhere else. Provenance rides through — the
 * occupation's own id, the task's own id, the release — because an aggregate
 * that cannot name the record it came from cannot be checked (D-177, D-229).
 *
 * Two sources are read today, both stable, versioned, and downloadable as
 * plain files: O*NET (tab-delimited text release) and ESCO (CSV release).
 * Postings and CVs are a later adapter, not a first source of truth.
 */

/** A profile read back from JSON — a fixture, or a cache a script wrote. */
export function readProfiles(file: string): WorkProfile[] {
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  const list = Array.isArray(parsed) ? parsed : (parsed as { profiles?: unknown[] }).profiles ?? [];
  return list.map((p, i) => validate(p, `${path.basename(file)}[${i}]`));
}

function validate(raw: unknown, where: string): WorkProfile {
  const p = raw as Partial<WorkProfile>;
  if (!p || typeof p.id !== 'string' || typeof p.title !== 'string' || typeof p.source !== 'string') {
    throw new Error(`${where}: a profile needs id, source and title`);
  }
  const tasks = (p.tasks ?? []).map((t, i) => {
    if (typeof t.id !== 'string' || typeof t.text !== 'string') {
      throw new Error(`${where}: task ${i} needs id and text`);
    }
    return { id: t.id, text: t.text, required: t.required !== false, sourceId: t.sourceId } as WorkTask;
  });
  return {
    id: p.id,
    source: p.source,
    sourceVersion: p.sourceVersion,
    sourceUrl: p.sourceUrl,
    title: p.title,
    aliases: p.aliases ?? [],
    tasks,
    skills: p.skills ?? [],
    tools: p.tools ?? [],
    domain: p.domain,
    occupationId: p.occupationId,
  };
}

// ---------------------------------------------------------------------------
// O*NET — the tab-delimited text database (onetcenter.org/database.html).
// Fields hold no tabs and no newlines, so a split per line is the whole parser.

const ONET_FILES = {
  occupations: 'Occupation Data.txt',
  tasks: 'Task Statements.txt',
  titles: 'Alternate Titles.txt',
  skills: 'Skills.txt',
  technology: 'Technology Skills.txt',
  tools: 'Tools Used.txt',
} as const;

/** Skills the source rates at this importance or above (IM scale, 1–5) are kept. */
export const ONET_SKILL_IMPORTANCE = 3;

function tsv(dir: string, name: string): Record<string, string>[] {
  const file = path.join(dir, name);
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.length > 0);
  const head = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const cells = line.split('\t');
    const row: Record<string, string> = {};
    head.forEach((h, i) => (row[h] = cells[i] ?? ''));
    return row;
  });
}

/** The release named in Read Me.txt ("O*NET 30.0 Database"), else the folder's name. */
export function onetVersion(dir: string): string {
  const readme = path.join(dir, 'Read Me.txt');
  if (existsSync(readme)) {
    const m = /O\*NET\s+([\d.]+)\s+Database/.exec(readFileSync(readme, 'utf8'));
    if (m) return m[1];
  }
  return path.basename(dir);
}

/** Every occupation in an O*NET text release as a profile; `only` narrows to some SOC codes. */
export function readOnet(dir: string, only?: readonly string[]): WorkProfile[] {
  const version = onetVersion(dir);
  const keep = only ? new Set(only) : null;
  const by = <T>(rows: Record<string, string>[], pick: (r: Record<string, string>) => T) => {
    const out = new Map<string, T[]>();
    for (const r of rows) {
      const code = r['O*NET-SOC Code'];
      if (keep && !keep.has(code)) continue;
      (out.get(code) ?? out.set(code, []).get(code)!).push(pick(r));
    }
    return out;
  };
  const tasks = by(tsv(dir, ONET_FILES.tasks), (r) => ({
    id: r['Task ID'],
    text: r['Task'],
    required: r['Task Type'] !== 'Supplemental',
  }));
  const titles = by(tsv(dir, ONET_FILES.titles), (r) => r['Alternate Title']);
  const skills = by(
    tsv(dir, ONET_FILES.skills).filter(
      (r) => r['Scale ID'] === 'IM' && Number(r['Data Value']) >= ONET_SKILL_IMPORTANCE,
    ),
    (r) => r['Element Name'],
  );
  const tech = by(tsv(dir, ONET_FILES.technology), (r) => r['Example']);
  const tools = by(tsv(dir, ONET_FILES.tools), (r) => r['Example']);

  return tsv(dir, ONET_FILES.occupations)
    .filter((r) => !keep || keep.has(r['O*NET-SOC Code']))
    .map((r) => {
      const code = r['O*NET-SOC Code'];
      return {
        id: `onet:${code}`,
        source: 'onet',
        sourceVersion: version,
        sourceUrl: `https://www.onetonline.org/link/summary/${code}`,
        title: r['Title'],
        aliases: uniq(titles.get(code) ?? []),
        tasks: (tasks.get(code) ?? []).map((t) => ({
          id: `onet:${code}:${t.id}`,
          text: t.text,
          required: t.required,
          sourceId: t.id,
        })),
        skills: uniq(skills.get(code) ?? []),
        tools: uniq([...(tech.get(code) ?? []), ...(tools.get(code) ?? [])]),
        domain: code.slice(0, 2),
        occupationId: code,
      };
    });
}

// ---------------------------------------------------------------------------
// ESCO — the CSV release (esco.ec.europa.eu/en/use-esco/download). ESCO has
// no task statements: an occupation's essential and optional *skills* are the
// nearest thing to duties, so they become the tasks, with `required` read off
// the relation type; knowledge items become `skills`.

const ESCO_FILES = {
  occupations: 'occupations_en.csv',
  skills: 'skills_en.csv',
  relations: 'occupationSkillRelations_en.csv',
} as const;

/** A quoted-field CSV parser: commas and newlines inside quotes are data. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

function csv(dir: string, name: string): Record<string, string>[] {
  const file = path.join(dir, name);
  if (!existsSync(file)) return [];
  const [head, ...rows] = parseCsv(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  return rows.map((cells) => {
    const row: Record<string, string> = {};
    head.forEach((h, i) => (row[h] = cells[i] ?? ''));
    return row;
  });
}

export function readEsco(dir: string, version = path.basename(dir), only?: readonly string[]): WorkProfile[] {
  const keep = only ? new Set(only) : null;
  const skills = new Map(csv(dir, ESCO_FILES.skills).map((r) => [r['conceptUri'], r]));
  const relations = new Map<string, Record<string, string>[]>();
  for (const r of csv(dir, ESCO_FILES.relations)) {
    const uri = r['occupationUri'];
    if (keep && !keep.has(uri)) continue;
    (relations.get(uri) ?? relations.set(uri, []).get(uri)!).push(r);
  }
  return csv(dir, ESCO_FILES.occupations)
    .filter((r) => !keep || keep.has(r['conceptUri']))
    .map((r) => {
      const uri = r['conceptUri'];
      const tasks: WorkTask[] = [];
      const knowledge: string[] = [];
      for (const rel of relations.get(uri) ?? []) {
        const skill = skills.get(rel['skillUri']);
        if (!skill) continue;
        const label = skill['preferredLabel'];
        if ((skill['skillType'] ?? '').includes('knowledge')) knowledge.push(label);
        else {
          tasks.push({
            id: `esco:${last(uri)}:${last(rel['skillUri'])}`,
            text: label,
            required: rel['relationType'] === 'essential',
            sourceId: rel['skillUri'],
          });
        }
      }
      return {
        id: `esco:${last(uri)}`,
        source: 'esco',
        sourceVersion: version,
        sourceUrl: uri,
        title: r['preferredLabel'],
        aliases: (r['altLabels'] ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
        tasks,
        skills: uniq(knowledge),
        tools: [],
        domain: r['iscoGroup'] || undefined,
        occupationId: uri,
      };
    });
}

const last = (uri: string) => uri.split('/').filter(Boolean).pop() ?? uri;
const uniq = (xs: string[]) => [...new Set(xs)];
