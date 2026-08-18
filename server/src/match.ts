import type { MatchSuggestion, RoleInfo, SkillInfo } from '@agentlings/shared';

/**
 * Concept matcher: turns a sentence a non-expert would write ("keep an eye on
 * my repo and write up what changed") into a role and a set of skills from the
 * installed catalog.
 *
 * Deliberately local and deterministic — BM25 over the catalog plus a concept
 * map that bridges everyday words to catalog vocabulary. No network, no auth,
 * no LLM; those refine this later but must never be required for it to answer.
 */

const STOPWORDS = new Set(
  `a an and the to of for in on at is are be been being will would should can could
   my me i it its that this these those with without do does did done have has had
   some something someone need needs want wants help please
   up out off each every all any so we us you your his her their as by from into
   over about when what who how why then than there here they them he she but or
   if not no yes just very really get gets got make makes made keep keeps kept
   take takes took thing things stuff lot more most less much many other another
   like also only even still much good bad new old own same`
    .split(/\s+/)
    .filter(Boolean),
);

/**
 * Everyday phrasing → catalog vocabulary. The catalog describes capability
 * ("documentation", "reconnaissance"); people describe outcomes ("write up",
 * "look into"). These two maps are the bridge, meant to be edited by hand.
 *
 * INTENT is what the user wants done; DOMAIN is what it is done to. Intent
 * decides the role — "look into the code" and "fix the code" want different
 * agentlings — so intent expands at full strength and domain at a third.
 */
const INTENT: Record<string, string[]> = {
  write: ['documentation', 'writing', 'write', 'words'],
  writing: ['documentation', 'writing', 'write', 'words'],
  wrote: ['documentation', 'writing', 'write'],
  document: ['documentation', 'writing', 'write'],
  summarize: ['summaries', 'documentation', 'report', 'writing'],
  summarise: ['summaries', 'documentation', 'report', 'writing'],
  recap: ['summaries', 'changelogs', 'report', 'writing'],
  explain: ['documentation', 'writing', 'guide'],

  // 'research' stopped bridging to scout's words (reconnaissance, survey)
  // when the researcher trade arrived and took the term as its own (D-129);
  // look/explore/survey/investigate still carry the scout phrasings.
  research: ['research', 'sources', 'brief', 'findings'],
  find: ['research', 'survey', 'findings', 'grep'],
  search: ['research', 'survey', 'grep', 'findings'],
  look: ['research', 'survey', 'read'],
  lookup: ['research', 'survey', 'read'],
  investigate: ['research', 'reconnaissance', 'survey', 'findings'],
  explore: ['research', 'survey', 'reconnaissance'],
  // "Have a look around the codebase" is reconnaissance in everyday words, and
  // the word `reconnaissance` is what the scout leads with — measured, the
  // sentence went to architect at 4.88 against scout's 4.20 without it.
  around: ['reconnaissance', 'survey'],
  browse: ['research', 'read', 'web'],
  compare: ['research', 'survey', 'findings'],
  survey: ['research', 'survey', 'reconnaissance'],
  review: ['review', 'research', 'read', 'findings'],
  check: ['review', 'research', 'read'],
  inspect: ['review', 'research', 'read'],
  audit: ['review', 'research', 'survey', 'findings'],
  read: ['read', 'research'],

  fix: ['fix', 'implement', 'refactor', 'build'],
  broken: ['fix', 'implement'],
  refactor: ['refactor', 'implement', 'build'],
  implement: ['implement', 'feature', 'build'],
  build: ['build', 'implement', 'builder'],
  develop: ['implement', 'build'],

  // Choosing between options is what an ADR is, and the everyday word for it
  // reached nothing: "decide whether we should store jobs in SQLite or keep
  // them on disk" matched the designer at 0.54 confidence.
  decide: ['architecture', 'decision', 'adr', 'blueprint'],
  decides: ['architecture', 'decision', 'adr'],
  deciding: ['architecture', 'decision', 'adr'],
  choose: ['architecture', 'decision', 'adr'],
  choosing: ['architecture', 'decision', 'adr'],

  // `draw` is left alone deliberately: the catalog already knows it, and which
  // agentling draws depends on the object — a diagram is the architect's, a
  // dusk sky is the designer's, and that is DOMAIN's job to say. Only the
  // forms nothing in the catalog carries are bridged.
  redraw: ['draw', 'design', 'visual', 'render'],
  redrawing: ['draw', 'design', 'visual', 'render'],
  restyle: ['design', 'visual', 'palette'],

  tidy: ['maintain', 'documentation'],
  organize: ['maintain', 'documentation'],
  organise: ['maintain', 'documentation'],
  clean: ['maintain', 'refactor'],
  maintain: ['maintain', 'documentation'],

  general: ['general', 'generalist', 'purpose'],
  generalist: ['general', 'generalist', 'purpose'],
  anything: ['general', 'generalist', 'purpose'],
  everything: ['general', 'generalist', 'purpose'],
  whatever: ['general', 'generalist', 'purpose'],
  various: ['general', 'generalist', 'purpose'],
  misc: ['general', 'generalist', 'purpose'],
};

const DOMAIN: Record<string, string[]> = {
  doc: ['documentation', 'readme', 'guide'],
  docs: ['documentation', 'readme', 'guide'],
  documentation: ['documentation', 'readme', 'guide', 'writing'],
  readme: ['documentation', 'readme', 'writing'],
  guide: ['documentation', 'guide', 'writing'],
  note: ['documentation', 'writing', 'notes'],
  notes: ['documentation', 'writing', 'notes'],
  summary: ['summaries', 'documentation', 'report'],
  changelog: ['changelogs', 'documentation', 'writing'],

  code: ['code', 'codebase', 'implement'],
  coding: ['code', 'codebase', 'implement'],
  bug: ['fix', 'implement'],
  bugs: ['fix', 'implement'],
  feature: ['feature', 'implement'],
  test: ['tests', 'implement'],
  tests: ['tests', 'implement'],
  script: ['code', 'implement', 'bash'],

  repo: ['codebase', 'repository', 'code'],
  repository: ['codebase', 'repository', 'code'],
  codebase: ['codebase', 'code'],
  project: ['codebase', 'code'],

  web: ['web', 'sources'],
  internet: ['web', 'sources'],
  online: ['web', 'sources'],

  // What this app's own visual work is made of. The catalog knows `plate`,
  // `world` and `palette`; the words a person uses for them — a background, a
  // sprite, the American spelling of colour — it did not.
  background: ['plate', 'world', 'palette'],
  backgrounds: ['plate', 'world', 'palette'],
  sprite: ['plate', 'world'],
  sprites: ['plate', 'world'],
  color: ['palette', 'colour', 'visual'],
  colors: ['palette', 'colour', 'visual'],
  colour: ['palette', 'colour', 'visual'],
  colours: ['palette', 'colour', 'visual'],
};

const INTENT_WEIGHT = 1.5;
const DOMAIN_WEIGHT = 0.55;
/** How far synonyms are dialled back when the catalog is full of the word. */
const BRIDGED = 0.45;
/** "Full of" — appearing in this fraction of the catalog or more. */
const COMMON = 0.15;

/**
 * A concept is one word's worth of evidence however many synonyms express it.
 * Splitting the weight across the set matters once the corpus is large: a
 * four-synonym concept like "write" would otherwise get four shots at every
 * document while a rare, specific word like "react" gets one.
 */
function expansionsFor(word: string): { terms: string[]; weight: number } {
  const spread = (terms: string[], weight: number) => ({
    terms,
    weight: weight / Math.sqrt(terms.length),
  });
  // Own keys only: INTENT['constructor'] is truthy on any object literal —
  // the inherited Object machinery, not a concept — and iterating it threw
  // on the first real sentence that mentioned a class's constructor
  // (D-197's trial, hand one). toString, valueOf and friends were the same
  // hole; every one 500'd the desk for as long as the maps have existed.
  if (Object.hasOwn(INTENT, word)) return spread(INTENT[word], INTENT_WEIGHT);
  if (Object.hasOwn(DOMAIN, word)) return spread(DOMAIN[word], DOMAIN_WEIGHT);
  return { terms: [], weight: 0 };
}

/** Crude suffix stripping — consistent across corpus and query is what matters. */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

function tokenize(text: string): string[] {
  return words(text).map(stem);
}

const K1 = 1.2;
const B = 0.75;
/** Below this, say so instead of guessing — a confident wrong answer is worse. */
export const MIN_CONFIDENCE = 0.35;

interface Doc {
  kind: 'role' | 'skill';
  name: string;
  description: string;
  terms: Map<string, number>;
  length: number;
}

export interface Scored {
  name: string;
  description: string;
  score: number;
}

/** A role or skill flattened into weighted text: name counts most, body least. */
function toDoc(
  kind: 'role' | 'skill',
  name: string,
  description: string,
  body: string,
): Doc {
  const terms = new Map<string, number>();
  const add = (text: string, weight: number) => {
    for (const term of tokenize(text)) terms.set(term, (terms.get(term) ?? 0) + weight);
  };
  add(name.replace(/-/g, ' '), 3);
  add(description, 2);
  add(body, 1);
  let length = 0;
  for (const count of terms.values()) length += count;
  return { kind, name, description, terms, length };
}

export class MatchIndex {
  private docs: Doc[] = [];
  private df = new Map<string, number>();
  private avgLength = 1;

  constructor(roles: (RoleInfo & { prompt?: string })[], skills: SkillInfo[]) {
    for (const role of roles) {
      // Only what the role says about itself. The names of its attached
      // abilities are configuration, and indexing them makes a role match
      // words it never claimed — "check-your-work" answering "how it works".
      this.docs.push(toDoc('role', role.name, role.description, role.prompt ?? ''));
    }
    for (const skill of skills) this.docs.push(toDoc('skill', skill.name, skill.description, ''));

    let total = 0;
    for (const doc of this.docs) {
      total += doc.length;
      for (const term of doc.terms.keys()) this.df.set(term, (this.df.get(term) ?? 0) + 1);
    }
    this.avgLength = this.docs.length > 0 ? total / this.docs.length : 1;
  }

  get size(): number {
    return this.docs.length;
  }

  /** True when any installed role or skill mentions this term at all. */
  knows(term: string): boolean {
    return this.df.has(term);
  }

  /** Share of the catalog that uses this term, 0–1. */
  private frequency(term: string): number {
    if (this.docs.length === 0) return 0;
    return (this.df.get(term) ?? 0) / this.docs.length;
  }

  /**
   * A word counts as understood if the catalog uses it, or if the concept map
   * bridges it to something the catalog uses. "anything" is understood because
   * it reaches "generalist", even though no role says "anything".
   */
  private understands(word: string): boolean {
    if (this.knows(stem(word))) return true;
    return expansionsFor(word).terms.some((related) => this.knows(stem(related)));
  }

  /** The catalog terms a word reaches, itself first. */
  private reach(word: string): string[] {
    return [stem(word), ...expansionsFor(word).terms.map(stem)];
  }

  private idf(term: string): number {
    const df = this.df.get(term) ?? 0;
    return Math.log(1 + (this.docs.length - df + 0.5) / (df + 0.5));
  }

  /**
   * Query terms with weights: the user's own words at full strength, then
   * concept expansions — intent at full, domain at a third.
   */
  private queryTerms(text: string): Map<string, number> {
    const weighted = new Map<string, number>();
    for (const word of words(text)) {
      const term = stem(word);
      weighted.set(term, Math.max(weighted.get(term) ?? 0, 1));
      const { terms, weight } = expansionsFor(word);
      // Synonyms exist to cover vocabulary the catalog lacks. Once a word is
      // everywhere in the catalog, its synonyms are noise — they let a common
      // concept like "check" drown out a rare, specific term like
      // "accessibility". A word that merely appears somewhere is still worth
      // bridging: presence alone is too crude a signal.
      const scale = this.frequency(term) >= COMMON ? BRIDGED : 1;
      for (const related of terms) {
        const rel = stem(related);
        weighted.set(rel, Math.max(weighted.get(rel) ?? 0, weight * scale));
      }
    }
    return weighted;
  }

  private scoreDoc(doc: Doc, query: Map<string, number>): number {
    let score = 0;
    for (const [term, weight] of query) {
      const freq = doc.terms.get(term);
      if (!freq) continue;
      const norm = 1 - B + (B * doc.length) / this.avgLength;
      score += weight * this.idf(term) * ((freq * (K1 + 1)) / (freq + K1 * norm));
    }
    return score;
  }

  /** Ranked roles and skills for a sentence, with the evidence behind them. */
  search(text: string): {
    roles: Scored[];
    skills: Scored[];
    confidence: number;
    matchedTerms: string[];
    gaps: string[];
  } {
    const query = this.queryTerms(text);
    const ranked = this.docs
      .map((doc) => ({ doc, score: this.scoreDoc(doc, query) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);

    const pick = (kind: 'role' | 'skill'): Scored[] =>
      ranked
        .filter((r) => r.doc.kind === kind)
        .slice(0, 3)
        .map((r) => ({ name: r.doc.name, description: r.doc.description, score: r.score }));

    const roles = pick('role');
    const skills = pick('skill');

    // What the user actually said, in their words, that the catalog knows.
    const spoken = words(text);
    const matchedTerms: string[] = [];
    const gaps: string[] = [];
    const top = ranked[0]?.doc;
    for (const word of spoken) {
      if (top && this.reach(word).some((term) => top.terms.has(term))) matchedTerms.push(word);
      else if (!this.understands(word)) gaps.push(word);
    }

    // Confidence leans on coverage — how much of the sentence we understood —
    // over raw score, because a strong hit on one word out of eight is a
    // coincidence, not a match.
    const best = ranked[0]?.score ?? 0;
    const understood = spoken.filter((w) => this.understands(w)).length;
    const coverage = spoken.length > 0 ? understood / spoken.length : 0;
    const strength = best / (best + 2);
    let score = 0.3 * strength + 0.7 * coverage;
    // Hard rule, not a weighting: if most of the sentence meant nothing to us,
    // one strongly-matching word is a coincidence and can't buy confidence.
    if (coverage < 0.3) score = Math.min(score, MIN_CONFIDENCE - 0.05);
    const confidence = Math.round(score * 100) / 100;

    return {
      roles,
      skills,
      confidence,
      matchedTerms: [...new Set(matchedTerms)].slice(0, 6),
      gaps: [...new Set(gaps)].slice(0, 6),
    };
  }
}

/**
 * The same matcher pointed at the remote library instead of what's installed:
 * ranked entries for a sentence, plus the words no source covers either.
 */
export function searchEntries<T extends { kind: 'role' | 'skill'; name: string; description: string }>(
  entries: T[],
  text: string,
  limit = 6,
): { hits: T[]; gaps: string[] } {
  const index = new MatchIndex(
    entries
      .filter((e) => e.kind === 'role')
      .map((e) => ({ name: e.name, description: e.description, tools: [], skills: [] })),
    entries.filter((e) => e.kind === 'skill'),
  );
  const found = index.search(text);
  const ranked = [...found.roles, ...found.skills].sort((a, b) => b.score - a.score);
  const hits: T[] = [];
  for (const scored of ranked) {
    const entry = entries.find((e) => e.name === scored.name && !hits.includes(e));
    if (entry) hits.push(entry);
    if (hits.length >= limit) break;
  }
  return { hits, gaps: found.gaps };
}

/**
 * The whole suggestion the hire popup shows: a role, the skills that role
 * already declares plus any the sentence itself asked for, and the evidence.
 */
export function suggestSetup(
  index: MatchIndex,
  roles: RoleInfo[],
  text: string,
): MatchSuggestion {
  const found = index.search(text);
  const top = found.roles[0];
  const confident = !!top && found.confidence >= MIN_CONFIDENCE;
  const role = confident ? roles.find((r) => r.name === top.name) : undefined;

  const skills = [...(role?.skills ?? [])];
  for (const skill of found.skills) {
    if (skill.score > 0 && !skills.includes(skill.name)) skills.push(skill.name);
  }

  return {
    role: role?.name ?? null,
    roleDescription: role?.description ?? '',
    skills,
    confidence: found.confidence,
    matchedTerms: found.matchedTerms,
    gaps: found.gaps,
    alternatives: found.roles
      .filter((r) => r.name !== role?.name)
      .map(({ name, description }) => ({ name, description })),
  };
}
