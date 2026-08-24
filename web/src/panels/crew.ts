import type { ConnectionInfo, CrewRole } from '@agentlings/shared';

/**
 * Meet the crew (Settings → catalog): AGENTLING.md in plain words, as a
 * character-select screen. The numbers on a trade's card come from
 * `/api/crew` — the role file, its quote ceiling, the ledger — and only the
 * prose lives here. A trade or a skill the copy does not know still shows,
 * on its own description, so the screen never hides what the catalog holds.
 */

export interface TradeCopy {
  /** The class tag on the card: BUILDER, RECON … */
  tag: string;
  /** What it is for, in one or two plain sentences. */
  blurb: string;
  /** Three things it does that the others do not. */
  moves: string[];
  /** The sprite's tint and hat. */
  tint: string;
  hat: string;
}

export const TRADES: Record<string, TradeCopy> = {
  worker: {
    tag: 'GENERALIST',
    blurb:
      'Takes any job, masters none. The one you hire first, and the one a skill reaches when you say hand to every worker.',
    moves: [
      'Tidies a messy folder into named subfolders',
      'Writes the result up with the outcome first',
      'Checks its own work before handing it in',
    ],
    tint: '#6abe30',
    hat: '#4b692f',
  },
  mason: {
    tag: 'BUILDER',
    blurb:
      'Builds, fixes and refactors code in a clone of your repo. Every change comes back as a patch you read before anything touches the real thing.',
    moves: ['Small, reviewable diffs', 'Runs the tests before reporting', 'Never pushes — you promote the patch'],
    tint: '#df7126',
    hat: '#8f4a18',
  },
  scout: {
    tag: 'RECON',
    blurb: 'Looks into how existing code and sources work and writes very little. Cheap and fast, on the small model.',
    moves: [
      'Maps a codebase before a mason touches it',
      'Cites where every claim came from',
      'Cannot edit code — the door is locked, not advised',
    ],
    tint: '#639bff',
    hat: '#3f3f74',
  },
  researcher: {
    tag: 'DEEP DIVE',
    blurb: 'Cited, cross-checked briefs from many sources. The longest leash in the crew.',
    moves: ['Searches, reads, then triangulates', 'Says plainly when sources disagree', 'Stops at the ceiling rather than running on'],
    tint: '#99e550',
    hat: '#4b692f',
  },
  scribe: {
    tag: 'WRITER',
    blurb: 'Turns work into words — and into real .docx files and styled PDF reports, printed offline through Edge.',
    moves: ['Plain language, no jargon', 'Designs the page, not just the text', 'Prints a PDF from its own HTML'],
    tint: '#fbf236',
    hat: '#df7126',
  },
  analyst: {
    tag: 'NUMBERS',
    blurb: 'Computes over records in a script it keeps, and draws the answer as an SVG chart. Cheap by design.',
    moves: ['Keeps the script, so the method can be replayed', 'Tables that line up, numbers that add up', 'Charts the result'],
    tint: '#9badb7',
    hat: '#3f3f74',
  },
  designer: {
    tag: 'VISUAL',
    blurb:
      'Worlds, layouts, colours. Renders its own work and looks at the picture before handing it in. Also authors the backdrop plates the game world is made of.',
    moves: ['Looks at what it drew, then fixes it', 'Builds a whole level pack', 'Slide decks and plate stacks'],
    tint: '#d77bba',
    hat: '#76428a',
  },
  drafter: {
    tag: 'DRAWINGS',
    blurb:
      'Blueprints, floor plans, CAD plots, site maps. Pulls the geometry out of the drawing, rebuilds the dimensioned model, then renders from it.',
    moves: ['Reads vector paths, not pixels', 'Derives the scale from the drawing itself', 'White-model massing; photoreal is off the table'],
    tint: '#5fcde4',
    hat: '#306082',
  },
  architect: {
    tag: 'BLUEPRINTS',
    blurb: 'C4 diagrams, module maps and decision records, drawn from the files that are actually there rather than from what the README says.',
    moves: ['Maps what exists, cites the file', 'Writes ADRs', 'Does not edit code'],
    tint: '#ac3232',
    hat: '#45283c',
  },
  operations: {
    tag: 'QUALITY',
    blurb:
      'How the work is done, written down: procedures, work instructions, acceptance criteria, and test or inspection findings read against the standard they are meant to meet.',
    moves: ['Names the clause it is checking against', 'Puts the measurement beside the limit', 'Prepares the record — a qualified person signs it'],
    tint: '#8f974a',
    hat: '#4b692f',
  },
  logistics: {
    tag: 'SUPPLY',
    blurb:
      'Stock, reorder points, lead times and what the freight really costs. Compares suppliers, carriers and routes on criteria it names before the verdict.',
    moves: ['Scores every option, including the losers', 'Keeps the script, so the sums can be replayed', 'Never places an order — you do'],
    tint: '#cbdbfc',
    hat: '#595652',
  },
  planner: {
    tag: 'PLAN',
    blurb:
      'Breaks work into pieces and puts them in order: work breakdowns, milestones, dependencies, and a risk register with owners against it.',
    moves: ['Every estimate carries its basis', 'Names the critical path and what slips with it', 'Plans on paper — schedules nobody'],
    tint: '#847e87',
    hat: '#45283c',
  },
  security: {
    tag: 'AUDIT',
    blurb:
      'Audits a clone for dependency advisories, committed secrets and weak permissions — every finding at a file and line, ranked by how it would actually be exploited.',
    moves: ['Ranks by exploitability, not by count', 'Says plainly when a finding is theoretical', 'Reads a copy — never probes anything running'],
    tint: '#d95763',
    hat: '#45283c',
  },
  clerk: {
    tag: 'DESK',
    blurb:
      'Standing desks. Reads your connected calendar and mail and briefs the day: events, clashes, invites and mail waiting on a reply. Runs on a schedule you set.',
    moves: ['Reads, never sends — a reply is a job you approve', 'Morning brief on a schedule', 'Cheapest seat in the house'],
    tint: '#eec39a',
    hat: '#8f563b',
  },
};

/** A trade the copy does not know: its description stands in, on a neutral tint. */
export function tradeCopy(role: Pick<CrewRole, 'name' | 'description'>): TradeCopy {
  return (
    TRADES[role.name] ?? {
      tag: 'TRADE',
      blurb: role.description,
      moves: [],
      tint: '#9badb7',
      hat: '#3f3f74',
    }
  );
}

/** Role tool names in the words a person uses; unknown names pass through. */
export function toolWord(tool: string): string {
  switch (tool) {
    case 'bash':
      return 'shell';
    case 'grep':
      return 'search files';
    case 'web_fetch':
      return 'read pages';
    default:
      return tool;
  }
}

/** A model id in the words AGENTLING.md uses: `claude-haiku-4-5-20251001` is Haiku 4.5; unset is the default. */
export function modelWord(model: string | undefined): string {
  if (!model) return 'default';
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d)(?!\d))?/.exec(model);
  if (!m) return model;
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}`;
}

/** Tools, skills, model and turns, with the defaults a role inherits by naming none. */
export function cardFacts(role: CrewRole, defaultTurns: number): {
  tools: string[];
  model: string;
  turns: number;
} {
  return {
    tools: (role.tools.length > 0 ? role.tools : ['read', 'write', 'edit', 'bash', 'grep']).map(toolWord),
    model: modelWord(role.model),
    turns: role.maxTurns ?? defaultTurns,
  };
}

/**
 * The spend line: the ceiling a session may be quoted, and what sessions
 * have cost — the two numbers the card contrasts. The measured bar is drawn
 * against the ceiling, so a trade spending a third of what it may is a bar
 * a third full.
 */
export function spendLine(role: CrewRole): { ceiling: string; measured: string; share: number } {
  const usd = (n: number) => (n < 1 ? `${Math.round(n * 100)}c` : `$${n.toFixed(2)}`);
  const { samples, meanUsd, maxUsd } = role.measured;
  return {
    ceiling: usd(role.ceilingUsd),
    measured:
      samples === 0
        ? 'no full session yet'
        : `${usd(meanUsd)} avg · ${usd(maxUsd)} most · ${samples} session${samples === 1 ? '' : 's'}`,
    share: role.ceilingUsd > 0 ? Math.min(1, meanUsd / role.ceilingUsd) : 0,
  };
}

export const SKILLS: Record<string, string> = {
  'concise-reports': 'Outcome first, evidence second, nothing padded.',
  'check-your-work': 'Run it, read it, then say so — before reporting.',
  'small-diffs': 'Change the least that fixes it; a reviewer should read the patch in one sitting.',
  'cite-sources': 'Every claim names where it came from.',
  'deep-research': 'Search, read many, cross-check, say where sources disagree.',
  'plain-language': 'Short words, short sentences, no jargon.',
  'document-design': 'A page with hierarchy, margins and a readable measure.',
  'pdf-report': 'Author one HTML page and print it to a styled PDF, offline.',
  'tables-and-numbers': 'Columns that line up, units that are stated, totals that add up.',
  'data-analysis': 'Compute in a kept script; chart the result as SVG.',
  'organizing-folders': 'Sort a messy folder into named subfolders with a manifest.',
  'see-your-work': 'Render it, look at the picture, fix what is wrong.',
  'authoring-a-level-pack': 'Build a whole game level pack from sources. Written by a run, not by hand.',
  'plate-design': 'Backdrop plate stacks for the world: 2000×900 layers on a 128-colour budget.',
  'deck-design': 'Slide decks that read from the back of the room.',
  'plan-geometry': 'Extract vector geometry from a CAD plot, derive the scale, place every sheet in one frame.',
  'architecture-blueprints': 'C4 diagrams and module maps from the real files.',
  ponytail: 'A third-party planning ladder, adapted and measured. It cost as much as it saved.',
};

/** Which trades carry a skill by default, read off the roles rather than typed. */
export function carriedBy(skill: string, roles: readonly CrewRole[]): string[] {
  return roles.filter((r) => r.skills.includes(skill)).map((r) => r.name);
}

export const POWERS: { name: string; text: string; partial?: boolean }[] = [
  { name: 'Read, write and edit files', text: 'In its own folder only. Which of the three it may do is set by its trade.' },
  { name: 'Run commands', text: 'A shell, if its trade has one. A trade without a shell has no way to run anything.' },
  {
    name: 'Work on your code',
    text: 'A local clone of your repo. Every change comes back as a patch; your real repo is untouched until you promote it.',
  },
  { name: 'Read what you attach', text: 'Up to 5 files, 10 MB each. Spreadsheets, PDFs, documents, images.' },
  { name: 'Make real documents', text: '.docx, .xlsx, .pptx, .pdf. A styled PDF is printed from its own HTML, offline.' },
  {
    name: 'Read a web page',
    text: 'On by default. A page comes back as readable text, trimmed to 12,000 characters — a 573 KB article becomes about 3k tokens.',
  },
  { name: 'Find a page', text: 'With the search door open: titles, snippets, links. Then it reads the one it picked.' },
  {
    name: 'Look through a real browser',
    text: 'Eight read-only browser tools. It can navigate, look and screenshot. It cannot click, type or fill a form.',
    partial: true,
  },
  { name: 'Read a scanned PDF', text: 'OCR for a PDF with no text layer.' },
  {
    name: 'Read a technical drawing',
    text: 'Pull the vector paths out of a CAD plot — 153,926 of them on one real job — and rebuild the model.',
  },
  {
    name: 'Write and run scripts',
    text: 'Plain Node, no dependencies. Work done often enough compiles into a tool that runs with no model at all.',
  },
  {
    name: 'Pick up where it left off',
    text: 'A reply carries the last run forward — result, patch, lesson, approach — instead of paying to redo it.',
  },
  {
    name: 'Learn',
    text: 'Each job ends with a close-out: a lesson for itself, a method for its level, a note for the whole crew. A discarded job banks a lesson too.',
  },
  { name: 'Report', text: 'RESULT.md: what happened first, the evidence second.' },
];

/** The doors in plain words; a connection the copy does not know shows its own description. */
export const REACH: Record<string, string> = {
  web: 'Reads any page as text.',
  render: 'Prints its own HTML to PDF. Offline: every outside request is cut.',
  github: 'Reads a code host. Its one write, a review comment, happens at approval.',
  search: 'Finds pages.',
  bls: 'Reads US labour statistics, up to 50 series in one call.',
  calendar: 'Reads your events, clashes and invites awaiting a reply.',
  mail: 'Searches and reads your Gmail. Attachments are named, never fetched.',
  browser: 'A real headless browser, reading only.',
  telegram: 'Sends a message — at approval only.',
  google: 'Sends mail and creates events as you — at approval only.',
  'whatsapp-business': 'Sends pre-approved template messages — at approval only.',
  slack: 'Posts as your own bot — at approval only.',
};

export type DoorState = 'on' | 'key' | 'off' | 'send';

/** The pill on a door: sends are sends; a read is on, off, or waiting on a key. */
export function doorState(c: Pick<ConnectionInfo, 'kind' | 'ready' | 'enabled' | 'missingSecrets'>): DoorState {
  if (c.kind === 'send') return 'send';
  if (!c.ready && c.missingSecrets.length > 0) return 'key';
  return c.enabled ? 'on' : 'off';
}

export const LADDER: { tier: string; text: string; cost: string; paid?: boolean }[] = [
  { tier: 'answer', text: 'A question this level already knows the answer to, or an exact repeat.', cost: 'free' },
  { tier: 'fetch', text: 'A bare "read this page".', cost: 'free' },
  { tier: 'search', text: 'A bare "find me pages about X".', cost: 'free' },
  { tier: 'tool', text: 'A compiled tool matches the words and the shape of the job.', cost: 'free' },
  { tier: 'compose', text: 'A send where the desk already holds the recipient and the message.', cost: 'free' },
  { tier: 'oneshot', text: 'A method that has worked before, on a 5-turn leash.', cost: 'short session', paid: true },
  { tier: 'agent', text: 'Everything else. A full session.', cost: 'full session', paid: true },
];

export const NEVER: { name: string; text: string }[] = [
  {
    name: 'Not autonomous',
    text: 'It takes one job, does it, and stops. The only standing instructions — a schedule, a standing approval — were written by you.',
  },
  { name: 'Not a payer', text: 'It will never move money. Reading a statement is ordinary work; a wire cannot be reviewed back.' },
  {
    name: 'Not a planner',
    text: 'It splits a sentence into steps only where you wrote the order out: then, after that, a numbered list. At most four.',
  },
  { name: 'Not a chat', text: 'A reply is a new job carrying the last one forward. There is no live conversation with a running session.' },
  { name: 'Not shared', text: 'One user, no accounts, no hosting. It runs on this machine.' },
  { name: 'Not an actor', text: 'It reads and it produces. Everything that reaches the real world goes through you first.' },
  {
    name: 'Not outside its folder',
    text: 'It is asked to stay in its sandbox, and it does. But that is an instruction and a working directory, not an OS jail.',
  },
];
