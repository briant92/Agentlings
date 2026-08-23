/**
 * Positions (Meet the crew, D-229): human jobs a person would apply for,
 * written the way a posting writes them, each duty graded against what is
 * built — done, partly, or not this crew's — with the power, door or
 * decision the grade rests on. Hand-written and hand-graded on purpose: a
 * word match between a duty and a role's prompt is not evidence the role can
 * do it. O*NET-shaped (title, also-known-as, duties, skills) so a real
 * source can replace the data later without touching the screen.
 */

export type Grade = 'y' | 'p' | 'n';

export interface Duty {
  text: string;
  grade: Grade;
  /** What the grade rests on — a power, a door, a decision. */
  why: string;
}

export interface Position {
  title: string;
  aka: string[];
  /** The trade that fills it, or null when no seat can. */
  trade: string | null;
  also?: string;
  skills: string[];
  /** What must be on or attached before the trade can take the duties. */
  needs: string[];
  duties: Duty[];
}

const d = (text: string, grade: Grade, why: string): Duty => ({ text, grade, why });

export const POSITIONS: Position[] = [
  {
    title: 'Junior developer',
    aka: ['software developer', 'programmer', 'coder', 'fix bugs'],
    trade: 'mason',
    also: 'scout for the reading-only half',
    skills: ['Git', 'a language the repo is in', 'reading tests', 'pull requests'],
    needs: ['a repo path on the level', 'the github door for the review comment (optional)'],
    duties: [
      d('Implement small features and fix bugs from a ticket', 'y', 'A clone of your repo, edits as a patch, tests run before the report (small-diffs, check-your-work).'),
      d('Write and run unit tests', 'y', 'A shell in the sandbox; the skill asks for the run before the write-up.'),
      d('Open a pull request and respond to review', 'p', 'The patch is yours to promote; the one write to GitHub is a review comment, replayed at approval (D-104). It never pushes.'),
      d('Refactor existing modules safely', 'y', 'Mason, 15 turns; the diff is small by rule.'),
      d('Attend stand-ups and estimate work', 'n', 'Not a chat and not a planner — it takes one job and stops.'),
      d('Deploy to staging or production', 'n', 'Never acts outside the sandbox; deployment is yours.'),
    ],
  },
  {
    title: 'Technical writer',
    aka: ['documentation', 'write the manual', 'user guide', 'docs'],
    trade: 'scribe',
    also: 'architect when the subject is the system itself',
    skills: ['plain English', 'Markdown and Word', 'reading code enough to describe it', 'page layout'],
    needs: ['the render door (on by default) for PDFs'],
    duties: [
      d('Turn engineering work into user-facing docs', 'y', 'Scribe with plain-language and document-design; reads the repo or the attachments.'),
      d('Produce .docx and PDF deliverables', 'y', 'A real .docx; a styled PDF printed from its own HTML through Edge, offline (D-128).'),
      d('Keep docs in step with code changes', 'p', 'A reply job carries the last run forward, but nothing watches the repo for you — you queue the update.'),
      d('Interview engineers for detail', 'n', 'Not a chat; it works from what is in the sandbox and what you wrote.'),
      d('Publish to the docs site', 'n', 'Never acts; the files come back for you to publish.'),
    ],
  },
  {
    title: 'Research analyst',
    aka: ['market research', 'desk research', 'literature review', 'find out'],
    trade: 'researcher',
    also: 'scout for a quick look',
    skills: ['web research', 'source evaluation', 'synthesis', 'citations'],
    needs: ['the search door (BRAVE_API_KEY); web reading is on by default'],
    duties: [
      d('Research a question across many sources', 'y', 'Search finds pages, fetch reads them as text; deep-research asks for triangulation.'),
      d('Write a cited brief with a recommendation', 'y', 'cite-sources names where each claim came from; 30 turns, a $4 ceiling.'),
      d('Read PDFs and reports', 'p', 'Text PDFs yes; scanned ones through OCR; nothing behind a login unless you saved a browser session.'),
      d('Run surveys or interviews', 'n', 'It reads; it does not ask people things.'),
      d('Present findings to stakeholders', 'n', 'A RESULT.md and the files; no meetings, and slides are a second job for the designer.'),
    ],
  },
  {
    title: 'Data analyst',
    aka: ['spreadsheet', 'numbers', 'reporting', 'chart this'],
    trade: 'analyst',
    also: 'scribe to write it up',
    skills: ['Excel and CSV', 'basic statistics', 'charts', 'SQL'],
    needs: ['nothing beyond an attachment — up to 5 files, 10 MB each'],
    duties: [
      d('Compute totals, trends and comparisons from records', 'y', 'A kept Node script over the attachment; a landed method replays on the short leash, and often enough compiles into a free tool.'),
      d('Produce charts', 'y', 'SVG charts from data-analysis; tables-and-numbers for the figures.'),
      d('Reconcile two statements', 'y', 'The reconciliation contract (D-222): matches, unmatched, adjustments; approve it and the next period starts from it.'),
      d('Query a live database', 'n', 'No database door exists; export the data and attach it.'),
      d('Build a dashboard that updates itself', 'n', 'One job, one result; nothing runs on its own except a schedule you set, which re-queues the same sentence.'),
    ],
  },
  {
    title: 'Graphic or UI designer',
    aka: ['visual design', 'slides', 'deck', 'mockup', 'layout'],
    trade: 'designer',
    skills: ['composition and colour', 'layout tools', 'iteration on feedback'],
    needs: ['the render door (on) for plates and PDFs'],
    duties: [
      d('Design slide decks and one-page layouts', 'y', 'deck-design and pdf-report; it renders and looks at its own work (see-your-work, D-112).'),
      d('Produce game backdrops and level art', 'y', 'Plate stacks on the 128-colour budget, tiles, depth maps (D-148, D-151).'),
      d("Iterate on a client's feedback", 'p', 'A reply job carries the files forward — each round is a job, not a conversation.'),
      d('Work in Figma or Illustrator', 'n', 'It writes HTML, SVG and PNG; no design tool is driven.'),
      d('Brand strategy and client workshops', 'n', 'Not a chat, not a meeting.'),
    ],
  },
  {
    title: 'CAD drafter or architectural technician',
    aka: ['floor plan', 'blueprint', 'site plan', 'drawings', '3D massing'],
    trade: 'drafter',
    skills: ['reading dimensioned drawings', 'scale and geometry', 'CAD output', '3D massing'],
    needs: ['the drawing as a PDF attachment; the render door for the output'],
    duties: [
      d('Extract geometry and scale from existing plans', 'y', "plan-geometry: vector paths out of a CAD plot, the scale derived from the drawing's own dimensions (D-198)."),
      d('Composite sheets into one coordinate frame', 'y', 'Closures and residuals in centimetres reported with the deliverable.'),
      d('Produce a 3D massing view', 'p', 'White-model massing in plan and aerial views; eye level is unreliable, photoreal is decided-not-built (D-204).'),
      d('Draw new plans from a brief', 'n', 'It works from a drawing that exists; it does not design a building.'),
      d('Stamp or submit drawings', 'n', 'Never acts, and nothing here is a licensed professional.'),
    ],
  },
  {
    title: 'Software architect',
    aka: ['system design', 'architecture review', 'ADR', 'C4'],
    trade: 'architect',
    also: 'scout for the survey',
    skills: ['systems thinking', 'diagramming', 'writing decision records'],
    needs: ['a repo path on the level'],
    duties: [
      d('Map an existing system as C4 or module diagrams', 'y', 'architecture-blueprints from the files that are there; Mermaid rendered in the review.'),
      d('Write architecture decision records', 'y', 'cite-sources names the file behind each claim.'),
      d('Propose a target architecture', 'p', 'It can draft one; it cannot weigh the organisation, the team or the roadmap it never sees.'),
      d('Lead design reviews with the team', 'n', 'Not a chat.'),
    ],
  },
  {
    title: 'Executive assistant',
    aka: ['inbox', 'calendar', 'schedule', 'assistant', 'briefing'],
    trade: 'clerk',
    skills: ['calendar management', 'email triage', 'discretion'],
    needs: ['Connect Google once — the calendar and mail read doors'],
    duties: [
      d('Brief the day: events, clashes, invites awaiting a reply', 'y', 'The clerk on a schedule, reading the calendar door (D-158).'),
      d('Triage the inbox — what needs a reply', 'y', 'The mail door, read-only: Gmail queries in, compact lines out (D-191).'),
      d('Reply to emails on your behalf', 'p', 'A reply is a job you approve; it goes out only at approval, and after three unchanged reviews a standing approval can send for you (D-082).'),
      d('Book meetings and move them', 'p', 'Creating an event is an approval-time act on the google door; moving or cancelling one is not built.'),
      d('Handle calls and visitors', 'n', 'It has no phone and no door.'),
      d('Make purchases and expense claims', 'n', 'Payments are on the shelf of never (D-219).'),
    ],
  },
  {
    title: 'Bookkeeper',
    aka: ['accounts', 'reconciliation', 'ledger', 'bank statement', 'month end'],
    trade: 'analyst',
    also: 'scribe for the written close',
    skills: ['double entry', 'reconciliations', 'spreadsheets', 'attention to detail'],
    needs: ['the statements as attachments'],
    duties: [
      d('Reconcile bank statements against the books', 'y', 'The reconciliation contract (D-222), and an arrest when there is nothing to reconcile against (D-224).'),
      d('Carry the closing balance into the next period', 'y', 'An approved reconciliation is banked and the next period starts from it (D-223).'),
      d('Classify unmatched entries', 'p', 'Categories the level has seen are applied; an unmatched category once came back unclassified and is watched.'),
      d('Post journals into the accounting system', 'n', 'No accounting-system door; the output is a report and a file.'),
      d('Pay suppliers and run payroll', 'n', 'Never moves money (D-219).'),
    ],
  },
  {
    title: 'Code reviewer or QA',
    aka: ['review my code', 'audit', 'look into', 'how does this work'],
    trade: 'scout',
    also: 'mason to act on what it finds',
    skills: ['reading unfamiliar code', 'spotting risk', 'writing it up short'],
    needs: ['a repo path on the level'],
    duties: [
      d('Read a codebase and explain how it works', 'y', 'Scout: read and search files, writes little, 12 turns on Haiku.'),
      d('Flag risks in a change', 'y', 'concise-reports, outcome first; the diff is in the sandbox.'),
      d('Run the test suite and report', 'p', 'The scout has no shell; hand that to a mason or a worker.'),
      d('Approve or block a merge', 'n', 'The decision is yours at review.'),
    ],
  },
  {
    title: 'Office administrator',
    aka: ['organise files', 'tidy', 'folders', 'admin'],
    trade: 'worker',
    skills: ['organisation', 'filing', 'general computer use'],
    needs: ['a folder on this machine'],
    duties: [
      d('Organise a messy folder into named subfolders', 'y', 'organizing-folders with a manifest; the folder organiser is bound to the local disk (D-169).'),
      d('Summarise documents', 'y', 'Up to 5 attachments; .docx, .xlsx, .pptx and .pdf read and written.'),
      d('Send a message or an update', 'p', 'Telegram, Slack, Gmail, WhatsApp — at approval only; a working session holds no sending tool (D-075).'),
      d('Order supplies, book travel', 'n', 'Never acts, never pays.'),
    ],
  },
  {
    title: 'Customer support representative',
    aka: ['support', 'help desk', 'customer service', 'live chat'],
    trade: null,
    skills: ['live conversation', 'empathy', 'account access', 'issuing refunds'],
    needs: [],
    duties: [
      d('Answer customers in real time', 'n', 'Not a chat — there is no live conversation with a running session.'),
      d('Look up and change customer accounts', 'n', 'No door to a customer system, and a session never writes outside its sandbox.'),
      d('Issue refunds and credits', 'n', 'Payments are on the shelf of never (D-219).'),
      d('Draft a reply to a customer email from a template', 'p', 'The one piece it can take: a draft, sent at approval. A worker or a scribe.'),
    ],
  },
];

/** Positions the board names when a search misses: each needs a person to talk, act or pay. */
export const NO_SEAT = ['sales representative', 'accounts payable clerk', 'receptionist', 'project manager'];

export function tally(p: Position): Record<Grade, number> {
  const t: Record<Grade, number> = { y: 0, p: 0, n: 0 };
  for (const duty of p.duties) t[duty.grade] += 1;
  return t;
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

/**
 * Plain-code search: a word in the title or an alias counts three, a word in
 * a duty counts one; nothing matched is not a result. No router, no model —
 * twelve cards answer the question, and the top matches are shown, never
 * one.
 */
export function score(p: Position, query: string): number {
  const qs = words(query);
  if (qs.length === 0) return 1;
  const names = [p.title, ...p.aka].map((s) => s.toLowerCase());
  const duties = p.duties.map((x) => x.text.toLowerCase()).join(' ');
  let s = 0;
  for (const w of qs) {
    if (names.some((n) => n.includes(w))) s += 3;
    else if (duties.includes(w)) s += 1;
  }
  return s;
}

/** The positions in match order for a query; all of them, in file order, for none. */
export function search(query: string, positions: readonly Position[] = POSITIONS): Position[] {
  return positions
    .map((p, i) => ({ p, i, s: score(p, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.p);
}

/** The human positions a trade fills — the reverse link on the trade's card. */
export function fills(trade: string, positions: readonly Position[] = POSITIONS): string[] {
  return positions.filter((p) => p.trade === trade).map((p) => p.title);
}
