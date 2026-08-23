import type {
  ProvenanceEdge,
  ProvenanceFlag,
  ProvenanceKind,
  ProvenanceNeighbourhood,
  ProvenanceNode,
} from '@agentlings/shared';

/**
 * Words for the provenance index (D-225), in the panel's own vocabulary:
 * a record's kind as a person would say it, a flag as a warning, an edge as
 * a sentence about where something came from. Pure, so the wording is
 * tested apart from the panel that shows it.
 */

export const KIND_WORD: Record<ProvenanceKind, string> = {
  job: 'job',
  note: 'level note',
  lesson: 'lesson',
  recipe: 'method',
  tool: 'tool',
  candidate: 'tool candidate',
  source: 'file you pointed at',
  passage: 'passage',
  reconciliation: 'banked reconciliation',
  agentling: 'agentling',
};

/** The order kinds are shown in: what the crew did first, what it read last. */
export const KIND_ORDER: ProvenanceKind[] = [
  'job',
  'lesson',
  'note',
  'recipe',
  'tool',
  'candidate',
  'reconciliation',
  'agentling',
  'source',
  'passage',
];

export const FLAG_WORD: Record<ProvenanceFlag, string> = {
  stale: 'over a week old — not in use',
  missing: 'no longer on disk',
  retired: 'retired',
  scanned: 'read from a scan',
  unparsed: 'could not be read',
  unlisted: 'not in the job list',
};

/**
 * What an edge says, read from the record you are looking at. The identifier
 * is named because it is the whole claim: "stamped with this job's title" is
 * a weaker fact than "the ledger row names this method", and a reader should
 * be able to tell.
 */
export function edgeWords(edge: ProvenanceEdge, from: string): string {
  const out = edge.from === from;
  const amb = edge.ambiguous ? ` — the title names ${edge.ambiguous} jobs; this is the first` : '';
  switch (edge.via) {
    case 'ledger.recipeKey':
      return out ? 'ran under this method, by its ledger row' : 'a run under it, by its ledger row';
    case 'job.prompt=recipe.key':
      return out ? 'its sentence is this method’s key' : 'a job with exactly this sentence';
    case 'ledger.tier=tool':
      return out ? 'done by this tool, for nothing' : 'a job this tool did, for nothing';
    case 'lesson.jobStamp':
      return (out ? 'learnt on this job, by its stamp' : 'a lesson stamped with this job') + amb;
    case 'note.title':
      return (out ? 'written about this job, by its title' : 'a level note naming this job') + amb;
    case 'note.agentling':
      return out ? 'by this agentling' : 'one of theirs';
    case 'manifest.recipeKey':
      return out ? 'compiled from this method' : 'compiled into this tool';
    case 'entry.source':
      return out ? 'read from this file' : 'a passage of this file';
    case 'job.continues':
      return out ? 'continues this job' : 'continued by this job';
    case 'reconciliation.jobId':
      return out ? 'approved on this job' : 'the reconciliation banked from it';
    case 'prior.jobId':
      return out ? 'started from this banked state' : 'handed to this job as its prior';
    case 'candidate.recipeKey':
      return out ? 'counts toward compiling this' : 'a run that counted toward compiling it';
    default:
      return out ? `→ ${edge.via}` : `← ${edge.via}`;
  }
}

/** The records around one, grouped by kind in display order, each with its sentence. */
export function grouped(
  around: ProvenanceNeighbourhood,
): { kind: ProvenanceKind; rows: { node: ProvenanceNode; words: string }[] }[] {
  const byId = new Map(around.nodes.map((n) => [n.id, n]));
  const rows = new Map<ProvenanceKind, { node: ProvenanceNode; words: string }[]>();
  for (const edge of around.edges) {
    const otherId = edge.from === around.node.id ? edge.to : edge.from;
    const other = byId.get(otherId);
    if (!other) continue;
    const list = rows.get(other.kind) ?? [];
    list.push({ node: other, words: edgeWords(edge, around.node.id) });
    rows.set(other.kind, list);
  }
  return KIND_ORDER.filter((k) => rows.has(k)).map((kind) => ({ kind, rows: rows.get(kind)! }));
}

/** `memory/pip.md:3` — where a record was read from, for the reader who wants the file. */
export function originWords(node: ProvenanceNode): string {
  return node.origin.line === undefined ? node.origin.file : `${node.origin.file}:${node.origin.line}`;
}

/** A count of records as a sentence fragment: "154 level notes", "1 tool". */
export function countWords(kind: ProvenanceKind, n: number): string {
  const word = KIND_WORD[kind];
  if (n === 1) return `1 ${word}`;
  const plural = word.endsWith('you pointed at') ? word.replace('file you', 'files you') : `${word}s`;
  return `${n} ${plural}`;
}
