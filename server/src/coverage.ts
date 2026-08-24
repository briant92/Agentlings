import type {
  CoverageResult,
  GapKind,
  RoleInfo,
  RosterState,
  TaskCoverage,
  TaskGrade,
  WorkProfile,
  WorkTask,
} from '@agentlings/shared';
import { MIN_CONFIDENCE, type MatchIndex } from './match';
import { pickAgentling } from './work';

/**
 * Coverage: a real-world job (a `WorkProfile`) graded duty by duty against
 * the crew as it stands, with the reason under every grade.
 *
 * Three kinds of evidence are weighed, in this order, and the result says
 * which one it rests on:
 *
 *  1. BOUNDARIES — what an agentling will not or cannot do, recorded by
 *     decision: pay, act, talk, sign, reach a system with no door, do
 *     physical work. A duty on a boundary is graded off the boundary and
 *     never off the words, and it is the *only* way a duty earns the visible
 *     "not this crew" (D-229's red row).
 *  2. POWERS — what is built, which trades carry it and which door it needs,
 *     each citing the decision that landed it. A duty a power vouches for is
 *     covered (or partial, when the power is), by a role that carries it.
 *  3. THE MATCHER — `MatchIndex`, unchanged: BM25 plus the concept map. Its
 *     confidence and its unknown words make the *matcher* gap. A duty the
 *     words reach but no power vouches for stays a matcher gap too, because
 *     D-229 stands: a word match between a duty and a role's prompt is not
 *     evidence the role can do it.
 *
 * What this deliberately does not do: treat low confidence as a missing
 * role, or substitute the worker. The fallback the queue makes (D-200) is
 * recorded in `roster`, apart from the grade.
 */

export interface Door {
  name: string;
  /** Live right now: on, and every secret set. */
  open: boolean;
}

export interface CrewState {
  awake: readonly { role: string; state?: string }[];
  resting?: readonly { role: string }[];
}

/**
 * A term is a whole word or phrase, case-insensitive; a trailing `*` matches
 * a prefix ("payment*" reads payment and payments). Compiled once per entry,
 * because the benchmark reads eighteen thousand duties against every entry.
 */
export function compileTerms(terms: readonly string[]): { term: string; re: RegExp }[] {
  return [...new Set(terms)].map((term) => {
    const prefix = term.endsWith('*');
    const word = (prefix ? term.slice(0, -1) : term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { term, re: new RegExp(`\\b${word}${prefix ? '' : '\\b'}`, 'i') };
  });
}

const hits = (text: string, compiled: readonly { term: string; re: RegExp }[]): string[] =>
  compiled.filter((c) => c.re.test(text)).map((c) => c.term);

export interface Boundary {
  id: string;
  gap: Exclude<GapKind, 'matcher' | 'roster'>;
  /** Hard: the duty is uncovered and the evidence says "not this crew". Soft: partial, with a door or an approval between. */
  hard: boolean;
  terms: string[];
  why: string;
  /** The door that would carry it, when one exists in the catalog. */
  door?: string;
}

/**
 * The shelf of never and the not-builts, as words a duty would use. Every
 * entry cites its decision. Hand-written, like D-229's grades, and for the
 * same reason: a boundary is a decision, and no word match can find one.
 */
export const BOUNDARIES: Boundary[] = [
  {
    id: 'money',
    gap: 'policy',
    hard: true,
    terms: ['pay', 'pays', 'paid', 'payment*', 'payroll', 'purchas*', 'procure*', 'disburse*', 'refund*', 'reimburse*', 'remit*', 'transfer funds', 'wire transfer*', 'collect payment*', 'collect fee*', 'collect money', 'collect debt*', 'cash handling', 'handle cash', 'cashier*', 'sell', 'sells', 'selling', 'requisition*', 'order supplies', 'order materials', 'order parts', 'order equipment', 'order merchandise', 'place order*', 'bill customer*', 'bill client*', 'process payment*', 'process payroll', 'deposit*', 'withdraw*'],
    why: 'Never moves money or takes it: payments are on the shelf of never (D-219).',
  },
  {
    id: 'people',
    gap: 'policy',
    hard: true,
    terms: ['meet with', 'attend meeting*', 'chair meeting*', 'lead meeting*', 'in meetings', 'at meeting*', 'preside*', 'confer with', 'consult with', 'negotiat*', 'interview*', 'counsel*', 'greet*', 'telephone*', 'phone call*', 'answer call*', 'in person', 'face-to-face', 'liaise*', 'collaborate with', 'coordinate with', 'communicate with', 'discuss*', 'present to', 'presentation* to', 'lecture*', 'teach*', 'tutor*', 'instruct student*', 'supervis*', 'hire', 'hires', 'hiring', 'recruit*', 'train staff', 'train employee*', 'train worker*', 'train personnel', 'train new', 'train other*', 'train user*', 'train client*', 'train customer*', 'mentor*', 'direct staff', 'direct employee*', 'direct worker*', 'direct activities of', 'direct the activities', 'direct or coordinate', 'direct and coordinate', 'plan, direct', 'direct, plan', 'direct, coordinate', 'plan, organize', 'organize, direct', 'plan and direct', 'plan and coordinate', 'coordinate activities', 'coordinate the activities', 'coordinate operations', 'coordinate work', 'coordinate staff', 'oversee*', 'manage staff', 'manage employee*', 'manage team*', 'manage operations', 'manage the', 'lead team*', 'delegate*', 'assign duties', 'assign work', 'assign task*', 'assign staff', 'schedule staff', 'schedule employee*', 'schedule worker*', 'evaluate employee*', 'evaluate staff', 'evaluate performance of', 'performance review*', 'performance evaluation*', 'discipline*', 'terminate employee*', 'conduct survey*', 'administer survey*', 'survey customer*', 'survey client*', 'survey resident*', 'survey employee*', 'focus group*', 'real-time', 'real time', 'live chat', 'customer service', 'customers in person', 'client visit*', 'visit client*', 'visit customer*', 'visit site*', 'home visit*', 'field visit*', 'patient*', 'student*', 'pupil*', 'participant*', 'attendee*', 'audience*', 'public speaking', 'speak to', 'speak with', 'talk to', 'talk with', 'explain to', 'persuade*', 'motivate*', 'resolve complaint*', 'handle complaint*', 'resolve conflict*', 'mediate*', 'refer client*', 'refer patient*', 'refer customer*', 'attend*', 'participate*', 'serve on', 'serve as', 'engage with', 'relationship*', 'rapport', 'represent the', 'represent a', 'represent an', 'serve customer*', 'serve client*', 'serve patron*', 'serve guest*', 'assist customer*', 'assist client*', 'assist patron*', 'assist guest*', 'assist patient*', 'help customer*', 'provide assistance to', 'demonstrat* product*', 'demonstrat* to', 'conduct tour*', 'conduct class*', 'conduct training', 'conduct workshop*', 'conduct session*', 'conduct meeting*', 'conduct interview*', 'conduct hearing*', 'workshop*', 'to stakeholders', 'with the team', 'answer question* from', 'respond to inquir*', 'respond to question*', 'inquiries from'],
    why: 'Not a chat and not a manager: no live conversation, meeting, call or supervision — it takes one job and stops (D-075, AGENTLING §14).',
  },
  {
    id: 'act',
    gap: 'policy',
    hard: true,
    terms: ['deploy*', 'publish*', 'install*', 'configure server*', 'release to production', 'go live', 'launch*', 'administer*', 'enforce*', 'arrest*', 'patrol*', 'escort*', 'dispatch*', 'issue permit*', 'issue license*', 'issue citation*', 'grant permission*', 'file lawsuit*', 'file claim*', 'file tax*', 'file return*'],
    why: 'Not an actor: everything that reaches the real world goes through you at review; it never deploys, publishes, installs or enforces (D-075, §14).',
  },
  {
    id: 'sign',
    gap: 'policy',
    hard: true,
    terms: ['approve', 'approves', 'approving', 'approval*', 'authoriz*', 'authoris*', 'sign', 'signs', 'signing', 'certify', 'certifies', 'certifying', 'notari*', 'stamp*', 'prescrib*', 'diagnose patient*', 'diagnose illness*', 'diagnose disease*', 'diagnose condition*', 'diagnose disorder*', 'legal advice', 'represent client*', 'testify', 'testifies', 'testimony', 'sworn', 'make decision*', 'final decision*', 'decide whether', 'accept or reject', 'approve or reject', 'approve or deny'],
    why: 'The decision is yours, and nothing here is a licensed professional: it drafts, it never signs, approves or certifies (D-229).',
  },
  {
    id: 'system',
    gap: 'door',
    hard: true,
    terms: ['database system*', 'query database*', 'update database*', 'maintain database*', 'into a database', 'into databases', 'into the database', 'in a database', 'in databases', 'database record*', 'database entr*', 'crm', 'erp', 'point-of-sale', 'point of sale', 'accounting system*', 'accounting software', 'enterprise resource', 'ticketing system*', 'hris', 'payroll system*', 'customer account*', 'user account*', 'bank account*', 'data entry', 'enter data', 'input data', 'key data', 'post journal*', 'post entries', 'post transaction*', 'update records in', 'enter into', 'entered into', 'log into', 'computer system* to', 'information system*', 'management system*', 'inventory system*', 'billing system*', 'reservation system*', 'booking system*', 'medical record*', 'health record*', 'electronic record*'],
    why: 'No door to a live business system exists — no database, CRM, ERP or accounting door; export the data and attach it (D-229, §15).',
  },
  {
    id: 'physical',
    gap: 'capability',
    hard: true,
    terms: ['operate machin*', 'run machin*', 'tend machin*', 'set up machin*', 'adjust machin*', 'repair machin*', 'maintain machin*', 'machine operator*', 'machinery', 'operate equipment', 'use equipment', 'maintain equipment', 'repair equipment', 'install equipment', 'set up equipment', 'equipment malfunction*', 'clean equipment', 'inspect equipment', 'adjust equipment', 'test equipment', 'calibrate equipment', 'handle equipment', 'load equipment', 'assemble equipment', 'operating equipment', 'operating machin*', 'operate vehicle*', 'drive vehicle*', 'inspect vehicle*', 'repair vehicle*', 'maintain vehicle*', 'vehicle maintenance', 'drive truck*', 'load truck*', 'unload truck*', 'operate forklift*', 'forklift*', 'operate crane*', 'crane*', 'operate tool*', 'hand tool*', 'power tool*', 'operate camera*', 'operate switchboard*', 'operate cash register*', 'operate register*', 'operate controls', 'lift', 'lifts', 'lifting', 'carry material*', 'carry equipment', 'carry heavy', 'carry load*', 'carry supplies', 'carry luggage', 'carry tray*', 'carry food', 'haul*', 'climb*', 'dig', 'digs', 'digging', 'harvest*', 'planting', 'prune*', 'mow*', 'irrigat*', 'fertiliz*', 'pesticide*', 'cook*', 'prepare food', 'prepare meal*', 'serve food', 'serve meal*', 'serve beverage*', 'wash dishes', 'kitchen equipment', 'cleans', 'clean and sanitiz*', 'clean room*', 'clean area*', 'clean surface*', 'clean facilit*', 'cleaning supplies', 'cleaning equipment', 'cleaning agent*', 'wash*', 'scrub*', 'sweep*', 'mop', 'mops', 'mopping', 'disinfect*', 'steriliz*', 'sanitiz*', 'repair*', 'weld*', 'solder*', 'sew', 'sews', 'sewing', 'paint', 'paints', 'painting', 'assemble product*', 'assemble part*', 'assemble component*', 'assemble furniture', 'assembly line*', 'disassembl*', 'fabricat*', 'apply cement', 'apply mortar', 'apply grout', 'grout*', 'manufacture product*', 'construction site*', 'construction work', 'construct building*', 'demolish*', 'drill*', 'sawing', 'grind*', 'sanding', 'pack', 'packs', 'packing', 'unload*', 'load and unload', 'load material*', 'load cargo', 'ship goods', 'ship product*', 'ship order*', 'deliver goods', 'deliver product*', 'deliver package*', 'deliver mail', 'drive', 'drives', 'driving', 'pilot aircraft', 'pilot vessel*', 'pilot boat*', 'fly aircraft', 'navigate vessel*', 'handle animal*', 'care for animal*', 'treat animal*', 'examine animal*', 'restrain animal*', 'groom*', 'animal care', 'livestock', 'crop', 'crops', 'soil sample*', 'till', 'tills', 'tilling', 'collect specimen*', 'handle specimen*', 'prepare specimen*', 'examine specimen*', 'surgical', 'surgery', 'surgeries', 'inject*', 'administer medication*', 'first aid', 'physical labor', 'physical labour', 'physical work', 'physically', 'manual labor', 'manual labour', 'site inspection*', 'conduct inspection*', 'inspect site*', 'inspect building*', 'inspect facilit*', 'inspect structure*', 'inspect product*', 'inspect work', 'on site', 'on-site', 'field work', 'fieldwork', 'calibrat*', 'read gauge*', 'read meter*', 'monitor gauge*', 'operate instrument*', 'test sample*', 'collect sample*', 'take measurement*', 'measure and mark', 'weigh', 'weighs', 'weighing', 'examine patient*', 'treat patient*', 'care for', 'feed animal*', 'feed patient*', 'feed livestock', 'bathe*', 'bathing', 'cut hair', 'style hair', 'nail care', 'massage*', 'cosmetic*', 'guard', 'guards', 'guarding', 'security check*', 'fight fire*', 'firefight*', 'extinguish*', 'rescue*', 'evacuat*', 'hand-held', 'handheld', 'wear', 'wears', 'wearing', 'walk', 'walks', 'walking', 'transport goods', 'transport material*', 'transport patient*', 'transport passenger*', 'stock shelves', 'shelve*', 'plumb*', 'wiring', 'electrical work', 'hvac', 'photograph', 'photographs', 'photographing', 'filming', 'shoot', 'shooting', 'sort mail', 'set up display*', 'arrange display*', 'arrange merchandise', 'stock merchandise', 'handle merchandise', 'handle material*', 'handle baggage', 'handle luggage', 'handle cargo', 'handle freight', 'handle animal*', 'handle specimen*', 'handle chemical*', 'handle waste', 'dispose of', 'disposal of', 'physical examination*', 'physical therap*', 'vital sign*', 'draw blood', 'collect blood'],
    why: 'No body: an agentling reads, computes and produces files; anything done with hands, machines, vehicles, materials or people in a room is outside what any of them can do (§10).',
  },
  {
    id: 'not-built',
    gap: 'capability',
    hard: true,
    terms: ['photoreal*', 'dashboard*', 'figma', 'illustrator', 'photoshop', 'autocad', 'revit', 'solidworks', 'sketchup', 'video*', 'audio', 'record sound*', 'podcast*', 'animation*', 'animate*', '3d print*', 'virtual reality', 'augmented reality', 'interpret for', 'sign language', 'voice*', 'speech*', 'live broadcast*', 'music*', 'perform music', 'perform on stage', 'theatrical', 'theater', 'theatre', 'act in', 'dance*', 'sing', 'sings', 'singing', 'transcri*', 'dictat*'],
    why: 'Decided or measured not-built: no design, CAD or media tool is driven, no audio or video is read or made, and photoreal rendering is off the table (D-204, D-229).',
  },
  {
    id: 'send',
    gap: 'door',
    hard: false,
    terms: ['send', 'sends', 'sending', 'email', 'emails', 'e-mail*', 'notify', 'notifies', 'notification*', 'reply to', 'replies to', 'respond to', 'responds to', 'responding to', 'answer inquir*', 'answer question*', 'answer correspondence', 'correspond with', 'distribute*', 'circulate*', 'forward*', 'mail', 'mails', 'mailing', 'post', 'posts', 'posting', 'message*', 'newsletter*', 'announce*', 'inform', 'informs', 'informing', 'advise client*', 'advise customer*', 'advise patient*', 'advise staff', 'advise manage*', 'report to manage*', 'report findings to', 'submit*', 'transmit*', 'send invitation*', 'remind*', 'schedule appointment*', 'schedule meeting*', 'book appointment*', 'book travel', 'book meeting*', 'booking*', 'arrange meeting*', 'make appointment*', 'set up meeting*', 'calendar invite*', 'create event*', 'outreach', 'contact', 'contacts', 'contacting', 'follow up with', 'follow-up with', 'alert*', 'communicate'],
    why: 'Partly: the draft is the crew’s, and it goes out only at approval — a message, a reply or a calendar event is replayed through the door when you approve it (D-075, D-082, D-158).',
    door: 'google',
  },
  {
    id: 'watch',
    gap: 'capability',
    hard: false,
    terms: ['monitor*', 'track', 'tracks', 'tracking', 'keep track', 'continuous*', 'ongoing', 'daily', 'weekly', 'routine*', 'regularly', 'periodic*', 'as needed', 'on an ongoing basis', 'keep abreast', 'stay current', 'stay informed', 'keep up to date', 'keep up-to-date', 'maintain awareness', 'watch', 'watches', 'oversight', 'ensure compliance', 'ensure that', 'ensure adherence', 'ensure accuracy', 'ensure quality', 'ensure proper', 'ensure timely', 'ensure all'],
    why: 'Partly: one job, one result — nothing watches on its own; a schedule you set re-queues the same sentence on a cadence (D-103, §14).',
  },
  {
    id: 'login',
    gap: 'door',
    hard: false,
    terms: ['portal*', 'log in', 'login*', 'sign in', 'intranet*', 'internal system*', 'behind a login', 'paywall*', 'members-only', 'online account*', 'vendor system*', 'supplier system*', 'client system*', 'customer system*'],
    why: 'Partly: a page behind a sign-in is readable only through the browser door with a session you saved yourself; it can look and never click or type (catalog, D-053).',
    door: 'browser',
  },
];

export interface Power {
  id: string;
  /** Trades that carry it, in preference order; `*` means every trade. */
  roles: string[];
  /** Built whole, or in part. */
  kind: 'live' | 'partial';
  terms: string[];
  /** Doors it needs; a closed one makes the duty partial with the door named. */
  needs?: string[];
  why: string;
}

/**
 * What is built, as words a duty would use. Derived from AGENTLING.md §4–§5
 * and the role files; each entry cites its decision. Narrow on purpose —
 * "prepare" alone would let the scribe claim "prepare meals" — so a duty
 * these miss falls to the matcher and is reported as unverified, never as
 * covered.
 */
export const POWERS: Power[] = [
  {
    id: 'build-code',
    roles: ['mason', 'worker'],
    kind: 'live',
    terms: ['implement feature*', 'implement function*', 'implement software', 'implement code', 'implement fix*', 'implementation of software', 'computer program*', 'software program*', 'programming', 'programmer*', 'source code', 'write code', 'coding', 'software', 'debug*', 'bug', 'bugs', 'fix bug*', 'bug fix*', 'refactor*', 'script', 'scripts', 'scripting', 'software application*', 'web application*', 'mobile application*', 'mobile app*', 'web app', 'web apps', 'api', 'apis', 'algorithm*', 'unit test*', 'write test*', 'run test*', 'test code', 'test software', 'automate*', 'automation', 'integrat* software', 'develop software', 'develop application*', 'develop code', 'develop web', 'html', 'css', 'javascript', 'typescript', 'python', 'java', 'sql', 'modify program*', 'modify software', 'modify code', 'update software', 'maintain software', 'maintain program*', 'maintain code', 'computer software', 'plugin*', 'linux', 'unix', 'version control', 'git', 'macro*', 'spreadsheet formula*', 'formulas', 'existing software', 'software package*', 'software requirement*', 'software or hardware', 'hardware or software', 'software modification*', 'system modification*', 'evaluate software', 'recommend software', 'stored procedure*', 'middleware', 'software tool*', 'software solution*', 'software upgrade*', 'code review*'],
    why: 'A clone of your repo in the sandbox, edits as a patch, the tests run before the report (mason: small-diffs, check-your-work; D-104 for the patch).',
  },
  {
    id: 'read-code',
    roles: ['scout', 'architect', 'mason'],
    kind: 'live',
    terms: ['review code', 'code review*', 'review software', 'analyze code', 'analyse code', 'analyze software', 'codebase*', 'architecture*', 'diagram*', 'system design*', 'software design*', 'design software', 'design database*', 'data model*', 'technical specification*', 'software specification*', 'technical design*', 'technical document*', 'dependenc*', 'c4', 'adr', 'decision record*', 'evaluate software', 'troubleshoot software', 'diagnose software', 'review change*', 'review a change', 'flag risk*', 'spot risk*', 'diff', 'diffs', 'flowchart*', 'flow chart*', 'user stor*', 'use case*'],
    why: 'Scout reads and searches a repo and writes little; architect draws C4 views, module maps and ADRs from the files that are there (architecture-blueprints).',
  },
  {
    id: 'write',
    roles: ['scribe', 'worker'],
    kind: 'live',
    terms: ['write', 'writes', 'writing', 'written', 'author', 'authors', 'authoring', 'draft', 'drafts', 'drafting', 'compose', 'composes', 'composing', 'edit', 'edits', 'editing', 'proofread*', 'copywrit*', 'document', 'documents', 'documenting', 'documentation', 'report', 'reports', 'summar*', 'manual', 'manuals', 'guide', 'guides', 'instruction*', 'memo', 'memos', 'memorand*', 'proposal*', 'article*', 'narrative*', 'briefing*', 'write a brief', 'write the brief', 'cited brief*', 'minutes', 'letter', 'letters', 'template*', 'plain language', 'docs', 'readme*', 'changelog*', 'release note*', 'faq', 'faqs', 'help text', 'user guide*', 'style guide*', 'abstract', 'abstracts', 'paper', 'papers', 'thesis', 'essay*', 'press release*', 'contract', 'contracts', 'agreement*', 'terms and conditions', 'job description*', 'curricul*', 'syllab*', 'lesson plan*', 'course material*', 'training material*', 'explain', 'explains', 'explaining', 'describe', 'describes', 'describing', 'outline', 'outlines', 'recommendation*', 'prepare report*', 'prepare document*', 'prepare correspondence', 'prepare summar*', 'prepare proposal*', 'prepare memo*', 'prepare letter*', 'prepare manual*', 'prepare material*', 'prepare plan*', 'prepare statement*', 'prepare contract*', 'prepare specification*', 'prepare outline*', 'prepare draft*', 'prepare text*', 'prepare article*', 'prepare paper*', 'prepare brief*', 'prepare guide*', 'prepare instruction*', 'prepare procedure*', 'prepare polic*', 'prepare description*', 'prepare list*', 'permit application*', 'licence application*', 'license application*', 'grant application*', 'grant proposal*', 'funding proposal*', 'funding application*', 'compliance report*', 'compliance document*', 'regulatory document*', 'regulatory submission*', 'regulatory filing*', 'regulatory report*', 'guidance document*', 'consensus standard*', 'international standard*', 'request for proposal*', 'requests for proposal*', 'rfp', 'rfps', 'statement of work', 'scope of work', 'status report*', 'impact report*', 'impact statement*', 'annual report*', 'board report*', 'white paper*', 'position paper*', 'business plan*', 'project plan*', 'work plan*', 'written plan*', 'develop plan*', 'develop polic*', 'develop procedure*', 'develop material*', 'develop curricul*', 'develop proposal*', 'develop report*', 'develop document*', 'develop content', 'develop standard*', 'develop guideline*', 'develop specification*', 'develop recommendation*', 'written', 'text', 'content', 'copy', 'translate technical'],
    why: 'Scribe writes and maintains documentation in plain language, and produces real .docx and PDF files read back before reporting (document-design, pdf-report, D-128).',
  },
  {
    id: 'research',
    roles: ['researcher', 'scout'],
    kind: 'live',
    terms: ['research*', 'investigat*', 'gather information', 'gather data', 'collect information', 'collect data', 'compile information', 'compile data', 'compile report*', 'compile statistic*', 'locate information', 'obtain information', 'find information', 'information source*', 'data source*', 'source material*', 'primary source*', 'secondary source*', 'source document*', 'reference material*', 'cite', 'cites', 'citing', 'citation*', 'literature', 'read report*', 'read document*', 'read article*', 'read publication*', 'read manual*', 'read specification*', 'evaluate source*', 'evaluate information', 'evaluate evidence', 'evaluate option*', 'evaluate alternative*', 'evaluate proposal*', 'evaluate product*', 'evaluate vendor*', 'evaluate supplier*', 'evaluate service*', 'evaluate program*', 'evaluate polic*', 'evaluate plan*', 'evaluate data', 'evaluate result*', 'evaluate finding*', 'evaluate report*', 'evaluate feasibilit*', 'assess option*', 'assess feasibilit*', 'assess risk*', 'assess impact*', 'assess need*', 'compare', 'compares', 'comparing', 'comparison*', 'benchmark*', 'best practice*', 'trend', 'trends', 'market research', 'market condition*', 'market data', 'market analys*', 'competitor*', 'industry trend*', 'industry standard*', 'regulation*', 'legislation', 'legal requirement*', 'regulatory requirement*', 'compliance requirement*', 'feasibilit*', 'background information', 'fact', 'facts', 'fact-check*', 'verify information', 'verify fact*', 'verify accuracy', 'verify data', 'validate data', 'verify source*', 'due diligence', 'interpret data', 'interpret result*', 'interpret finding*', 'interpret information', 'interpret regulation*', 'interpret law*', 'interpret polic*', 'online', 'internet', 'publication*', 'journal*', 'news', 'survey data', 'survey result*', 'census', 'prior art', 'patent*', 'case law', 'precedent*', 'scholar*', 'academic', 'scientific literature', 'technical literature', 'product information', 'price list*', 'quote', 'quotes', 'quotation*', 'supplier*', 'vendor*', 'manufacturer*', 'identify trend*', 'identify source*', 'identify option*', 'identify opportunit*', 'identify risk*', 'identify requirement*', 'identify need*', 'identify problem*', 'identify issue*', 'identify area*', 'identify potential', 'determine requirement*', 'determine feasibilit*', 'determine need*', 'analyze information', 'analyse information', 'analyze report*', 'analyze document*', 'analyze trend*', 'analyze market*', 'analyze result*', 'analyze problem*', 'analyze need*', 'analyze requirement*', 'analyze polic*', 'analyze legislation', 'analyze regulation*', 'analyze propos*', 'analyze plan*', 'analyze record*', 'analyze histor*', 'analyze survey*', 'analyze statistic*', 'review literature', 'review report*', 'review document*', 'review record*', 'review application*', 'review proposal*', 'review plan*', 'review data', 'review file*', 'review contract*', 'review polic*', 'review finding*', 'review result*', 'review research', 'review stud*', 'review article*', 'review paper*', 'review publication*', 'review material*', 'review information', 'review evidence', 'review case*', 'review claim*', 'review form*', 'review submission*', 'review manuscript*', 'review draft*', 'review content', 'examine document*', 'examine record*', 'examine report*', 'examine data', 'examine information', 'examine file*', 'examine application*', 'examine plan*', 'examine claim*', 'examine evidence', 'read report*', 'read manual*', 'read publication*', 'read literature', 'read article*', 'read document*', 'read file*', 'read record*', 'keep informed', 'stay abreast'],
    needs: ['web'],
    why: 'Researcher: search, read and triangulate into a cited brief (deep-research, cite-sources, 30 turns, a $4 ceiling); scout for the quick look. Pages are read through the web door (D-129).',
  },
  {
    id: 'find-pages',
    roles: ['researcher', 'scout'],
    kind: 'live',
    terms: ['search the web', 'search online', 'search the internet', 'web search*', 'internet search*', 'online search*', 'find source*', 'find page*', 'find article*', 'find information online', 'locate source*', 'search for', 'search database*', 'search record*', 'search file*', 'search literature', 'search publication*'],
    needs: ['search'],
    why: 'The search door (BRAVE_API_KEY): titles, snippets and links, then the page it picks is read (D-053).',
  },
  {
    id: 'numbers',
    roles: ['analyst', 'worker'],
    kind: 'live',
    terms: ['data', 'dataset*', 'spreadsheet*', 'excel', 'csv', 'calculat*', 'comput*', 'total', 'totals', 'sum', 'sums', 'count', 'counts', 'counting', 'tally', 'tallies', 'figure', 'figures', 'number', 'numbers', 'numeric*', 'quantit*', 'statistic*', 'metric*', 'percentage*', 'ratio', 'ratios', 'average*', 'median', 'variance*', 'deviation*', 'distribution*', 'regression*', 'correlation*', 'forecast*', 'financial projection*', 'sales projection*', 'revenue projection*', 'budget projection*', 'projected', 'estimate', 'estimates', 'estimating', 'estimation*', 'cost', 'costs', 'costing', 'price', 'prices', 'pricing', 'budget*', 'financial', 'finance', 'finances', 'account', 'accounts', 'accounting', 'ledger*', 'journal entr*', 'balance', 'balances', 'reconcil*', 'bank statement*', 'statement*', 'invoice*', 'bill', 'bills', 'billing', 'receipt*', 'expense*', 'revenue*', 'income', 'profit*', 'loss', 'losses', 'tax', 'taxes', 'asset*', 'liabilit*', 'depreciat*', 'amortiz*', 'cash flow*', 'trial balance*', 'general ledger*', 'accounts payable', 'accounts receivable', 'payable*', 'receivable*', 'audit', 'audits', 'auditing', 'chart', 'charts', 'charting', 'graph', 'graphs', 'graphing', 'plot', 'plots', 'table', 'tables', 'tabulat*', 'records', 'record data', 'inventory', 'inventories', 'stock level*', 'stock count*', 'throughput*', 'productivity', 'efficiency', 'performance data', 'performance metric*', 'performance indicator*', 'kpi*', 'analytics', 'analyze data', 'analyse data', 'data analys*', 'trend analys*', 'statistical analys*', 'quantitative', 'model', 'models', 'modeling', 'modelling', 'simulat*', 'scenario*', 'sensitivity analys*', 'variance analys*', 'financial analys*', 'financial statement*', 'financial report*', 'financial record*', 'financial data', 'financial model*', 'financial plan*', 'financial projection*', 'financial forecast*', 'financial information', 'timesheet*', 'time sheet*', 'hours worked', 'attendance record*', 'sales data', 'sales figure*', 'sales report*', 'sales record*', 'sales statistic*', 'operating budget*', 'operational budget*', 'annual budget*', 'departmental budget*', 'prepare budget*', 'develop budget*', 'manage budget*', 'budget request*', 'budget proposal*', 'budget report*', 'budget estimate*', 'cost estimate*', 'cost reduction*', 'cost analys*', 'cost control*', 'savings plan*', 'expense report*', 'expenditure report*', 'financial forecast*', 'interest rate*', 'exchange rate*', 'interest', 'loan*', 'mortgage*', 'insurance', 'premium*', 'claim', 'claims', 'commission*', 'discount*', 'margin*', 'volume', 'volumes', 'yield', 'yields', 'output', 'outputs', 'capacity', 'utilization', 'utilisation', 'consumption', 'usage', 'demographic*', 'population*', 'time series', 'time-series', 'longitudinal'],
    why: 'Analyst: computes over records in a kept Node script and draws the answer as an SVG chart (data-analysis, tables-and-numbers); the reconciliation contract for two statements (D-222).',
  },
  {
    id: 'documents',
    roles: ['scribe', 'designer', 'worker'],
    kind: 'live',
    terms: ['pdf*', 'word document*', 'docx', 'xlsx', 'pptx', 'powerpoint*', 'slides', 'slide deck*', 'slideshow*', 'deck', 'decks', 'presentation', 'presentations', 'formatted report*', 'formatting', 'format', 'formats', 'layout*', 'page layout*', 'typeset*', 'brochure*', 'flyer*', 'poster*', 'handout*', 'worksheet*', 'checklist*', 'one-page*', 'one page*', 'cover letter*', 'resume*', 'portfolio*', 'form template*', 'fillable form*', 'form layout*', 'spreadsheet*', 'workbook*', 'create presentation*', 'prepare presentation*', 'develop presentation*', 'status presentation*', 'presentation material*', 'briefing document*', 'briefing pack*'],
    needs: ['render'],
    why: 'Real .docx, .xlsx, .pptx and .pdf files; a styled PDF is printed from its own HTML through Edge, offline (D-128); deck-design and pdf-report for the look.',
  },
  {
    id: 'design',
    roles: ['designer'],
    kind: 'live',
    terms: ['design', 'designs', 'designing', 'graphic*', 'visual*', 'illustrat*', 'artwork', 'image', 'images', 'icon*', 'logo*', 'brand*', 'color*', 'colour*', 'palette*', 'typograph*', 'font*', 'mockup*', 'mock-up*', 'wireframe*', 'prototype*', 'user interface*', 'ui', 'ux', 'user experience*', 'sketch*', 'draw', 'draws', 'drawing', 'render*', 'composition*', 'aesthetic*', 'background*', 'sprite*', 'level art*', 'game art*', 'tile set*', 'tileset*', 'tile map*', 'infographic*', 'signage', 'decor*', 'texture*', 'storyboard*', 'concept art*', 'advertis*', 'marketing material*', 'promotional material*', 'packaging design*', 'label design*', 'layout', 'layouts'],
    needs: ['render'],
    why: 'Designer: draws in HTML, SVG and PNG, renders its own work and looks at it before handing it in (see-your-work, D-112); slide decks and plate stacks (deck-design, plate-design).',
  },
  {
    id: 'drawings',
    roles: ['drafter'],
    kind: 'live',
    terms: ['blueprint*', 'floor plan*', 'site plan*', 'technical drawing*', 'engineering drawing*', 'architectural drawing*', 'construction drawing*', 'drafting', 'draft drawing*', 'draft plan*', 'cad', 'cad drawing*', 'cad plot*', 'schematic*', 'elevation*', 'section drawing*', 'plan view*', 'as-built*', 'survey drawing*', 'dimensioned', 'dimension line*', 'scale drawing*', 'to scale', 'geometry', 'geometric*', 'coordinate system*', 'coordinate frame*', 'massing', '3d model*', '3-d model*', 'three-dimensional model*', 'solid model*', 'wireframe model*', 'site map*', 'plat map*', 'topograph*', 'contour*', 'layout drawing*', 'shop drawing*', 'detail drawing*', 'assembly drawing*', 'wiring diagram*', 'circuit diagram*', 'piping diagram*', 'plumbing plan*', 'electrical plan*', 'mechanical plan*', 'structural plan*', 'foundation plan*', 'roof plan*', 'landscape plan*', 'grading plan*', 'drainage plan*', 'utility plan*', 'parcel map*', 'zoning map*', 'land use map*', 'gis', 'geographic information', 'map', 'maps', 'mapping', 'survey data', 'surveying data', 'sketches', 'plans and specifications', 'drawings and specifications', 'specifications and drawings'],
    needs: ['render'],
    why: 'Drafter: vector geometry out of a CAD plot, the scale derived from the drawing’s own dimensions, sheets composited into one frame, white-model massing (plan-geometry, D-198, D-204).',
  },
  {
    id: 'desk',
    roles: ['clerk'],
    kind: 'live',
    terms: ['calendar*', 'appointment*', 'inbox*', 'email*', 'e-mail*', 'mail', 'correspondence', 'agenda*', 'daily schedule*', 'schedule for', 'schedule of', 'invitation*', 'invite', 'invites', 'rsvp*', 'triage*', 'brief the', 'briefing*', 'day ahead', 'conflicts', 'clashes', 'double-book*', 'meeting request*', 'meeting schedule*', 'meeting agenda*', 'diary', 'diaries', 'itinerar*', 'travel arrangement*', 'reservation*'],
    needs: ['calendar', 'mail'],
    why: 'Clerk: reads the connected calendar and mail and briefs the day — events, clashes, invites, mail awaiting a reply — on a schedule you set (D-158, D-191).',
  },
  {
    id: 'files',
    roles: ['worker', 'scribe'],
    kind: 'live',
    terms: ['organiz*', 'organis*', 'file', 'files', 'filing', 'folder*', 'archiv*', 'catalog*', 'index', 'indexes', 'indexing', 'sort', 'sorts', 'sorting', 'classif*', 'categoriz*', 'categoris*', 'rename*', 'manifest*', 'inventory of', 'maintain record*', 'maintain file*', 'maintain log*', 'maintain document*', 'maintain list*', 'maintain inventory', 'record keeping', 'recordkeeping', 'record-keeping', 'bookkeeping', 'keep record*', 'keep log*', 'keep file*', 'update record*', 'update file*', 'update log*', 'update document*', 'update list*', 'compile list*', 'compile file*', 'compile record*', 'compile document*', 'tidy', 'tidies', 'tidying', 'declutter*', 'clean up file*', 'duplicate*', 'deduplicat*', 'de-duplicat*', 'merge file*', 'merge document*', 'merge spreadsheet*', 'collate*', 'assemble document*', 'assemble report*', 'assemble information', 'assemble data', 'compile'],
    why: 'Worker: organising-folders with a manifest, bound to the local disk (D-169); reads and writes .docx, .xlsx, .pptx and .pdf.',
  },
  {
    id: 'attachments',
    roles: ['*'],
    kind: 'live',
    terms: ['attach*', 'upload*', 'scanned', 'ocr', 'optical character', 'handwrit*', 'extract text', 'extract data', 'extract information', 'extract figure*', 'extract table*', 'extract field*', 'read pdf*', 'pdf file*', 'image file*', 'convert file*', 'convert document*', 'file format*'],
    why: 'Up to 5 attachments, 10 MB each: spreadsheets, PDFs (text, or scanned through OCR), documents, images (§4, D-061).',
  },
  {
    id: 'revise',
    roles: ['*'],
    kind: 'partial',
    terms: ['iterate*', 'iteration*', 'revise*', 'revision*', 'rework*', 'redraft*', 'incorporate feedback', 'incorporate change*', 'address feedback', 'address comment*', 'update draft*', 'second draft*', 'next draft*', 'on feedback'],
    why: 'Partly: a reply job carries the last run forward — result, patch, lesson — so each round is a job you queue, not a conversation (§9, §14 not-a-chat).',
  },
  {
    id: 'code-host',
    roles: ['scout', 'mason', 'architect'],
    kind: 'live',
    terms: ['pull request*', 'merge request*', 'github', 'gitlab', 'issue tracker*', 'commit', 'commits', 'repositor*', 'branch'],
    needs: ['github'],
    why: 'The github door reads a code host: pull requests, issues, commits, files; its one write, a review comment, happens at approval (D-040, D-104).',
  },
  {
    id: 'procedures',
    roles: ['operations', 'scribe'],
    kind: 'live',
    terms: ['standard operating procedure*', 'operating procedure*', 'work instruction*', 'written procedure*', 'procedure manual*', 'quality control procedure*', 'quality assurance', 'quality standard*', 'quality requirement*', 'acceptance criteria', 'test plan*', 'test procedure*', 'test criteria', 'testing procedure*', 'inspection procedure*', 'inspection criteria', 'inspection report*', 'inspection record*', 'test report*', 'test record*', 'test data', 'test result*', 'conformance', 'nonconformance', 'non-conformance', 'corrective action*', 'preventive action*', 'root cause*', 'incident report*', 'deviation report*', 'safety procedure*', 'safety plan*', 'safety polic*', 'safety standard*', 'safety requirement*', 'safety record*', 'operating manual*', 'process documentation', 'process improvement*', 'quality metric*', 'defect rate*', 'tolerance*', 'checklist*'],
    why: 'Operations: the record of how work is done — procedures, work instructions, acceptance criteria, test and inspection findings read against the named standard, corrective actions (D-235). It prepares the record; a qualified person signs it.',
  },
  {
    id: 'supply',
    roles: ['logistics', 'analyst'],
    kind: 'live',
    terms: ['supply chain*', 'inventory level*', 'inventory record*', 'inventory report*', 'inventory count*', 'stock level*', 'stock record*', 'stock position*', 'reorder point*', 'safety stock', 'lead time*', 'bill of material*', 'demand forecast*', 'demand plan*', 'freight cost*', 'freight rate*', 'shipping cost*', 'landed cost*', 'carrier rate*', 'carrier option*', 'route optimi*', 'distribution network*', 'warehouse layout*', 'warehouse record*', 'warehouse report*', 'supplier comparison*', 'supplier evaluation*', 'supplier performance', 'vendor comparison*', 'vendor evaluation*', 'vendor performance', 'sourcing option*', 'procurement plan*', 'procurement polic*', 'logistics cost*', 'logistics plan*', 'shipment record*', 'shipping record*', 'stock rotation', 'obsolescence'],
    why: 'Logistics: stock positions, reorder points, lead times and supplier or carrier comparisons computed in a kept script and shown as a table that traces to its records (D-235). It compares and recommends; ordering and spending stay yours.',
  },
  {
    id: 'planning',
    roles: ['planner', 'scribe'],
    kind: 'live',
    terms: ['project plan*', 'programme plan*', 'work breakdown*', 'breakdown structure*', 'wbs', 'project schedule*', 'project timeline*', 'project milestone*', 'milestone*', 'critical path*', 'gantt*', 'task sequenc*', 'sequence of task*', 'project scope*', 'scope document*', 'statement of work', 'project charter*', 'risk register*', 'risk mitigation*', 'mitigation plan*', 'contingency plan*', 'implementation plan*', 'implementation schedule*', 'rollout plan*', 'resource plan*', 'resource requirement*', 'resource estimate*', 'effort estimate*', 'project requirement*', 'project deliverable*', 'project documentation', 'project status report*', 'progress report*', 'phase plan*', 'work plan*', 'action plan*'],
    why: 'Planner: work broken into pieces and put in order — breakdowns, milestones, dependencies, estimates carrying their basis, and a risk register (D-235). It plans on paper; scheduling people and committing dates stay yours.',
  },
  {
    id: 'security-audit',
    roles: ['security', 'mason'],
    kind: 'live',
    terms: ['vulnerabilit*', 'security audit*', 'security review*', 'security assessment*', 'security finding*', 'security requirement*', 'security polic*', 'security standard*', 'security control*', 'security risk*', 'security gap*', 'security document*', 'threat model*', 'attack surface*', 'cve', 'cwe', 'security advisor*', 'known advisor*', 'dependency audit*', 'dependenc* vulnerabilit*', 'outdated dependenc*', 'exposed credential*', 'hardcoded credential*', 'committed secret*', 'exposed secret*', 'secret scanning', 'access control*', 'permission model*', 'least privilege', 'privilege escalation*', 'authentication', 'authorization', 'authorisation', 'encryption', 'secure coding', 'input validation', 'injection flaw*', 'security hardening', 'hardening guide*'],
    why: 'Security: a clone audited for advisories, committed credentials, permission and configuration weakness, every finding at a file and line with the smallest fix (D-235). It audits a copy — it never scans, probes or signs in to a live system, and never applies the fix.',
  },
  {
    id: 'labour-stats',
    roles: ['analyst', 'researcher'],
    kind: 'live',
    terms: ['labor statistic*', 'labour statistic*', 'bls', 'employment statistic*', 'unemployment rate*', 'consumer price*', 'cpi', 'economic indicator*', 'wage data', 'wage statistic*', 'occupational data', 'occupational statistic*'],
    needs: ['bls'],
    why: 'The bls door reads US labour statistics, up to 50 series in one call (D-188).',
  },
];

const BOUNDARY_TERMS = new Map(BOUNDARIES.map((b) => [b.id, compileTerms(b.terms)]));
const POWER_TERMS = new Map(POWERS.map((p) => [p.id, compileTerms(p.terms)]));
const boundaryHits = (text: string, b: Boundary) => hits(text, BOUNDARY_TERMS.get(b.id)!);
const powerHits = (text: string, p: Power) => hits(text, POWER_TERMS.get(p.id)!);

const POWER_BY_ID = new Map(POWERS.map((p) => [p.id, p]));
const BOUNDARY_BY_ID = new Map(BOUNDARIES.map((b) => [b.id, b]));

export const powerById = (id: string) => POWER_BY_ID.get(id);
export const boundaryById = (id: string) => BOUNDARY_BY_ID.get(id);

/** The state of the level the grade is read against. Every installed role held when `crew` is omitted. */
export interface CoverageContext {
  index: MatchIndex;
  roles: readonly RoleInfo[];
  doors: readonly Door[];
  crew?: CrewState;
}

/** Does anyone awake hold this role; are the only holders resting; who takes it otherwise (D-200). */
export function rosterState(ctx: CoverageContext, role: string | null): RosterState {
  if (!role) return { role: null, held: false, resting: false, fallbackRole: null };
  if (!ctx.crew) {
    const installed = ctx.roles.some((r) => r.name === role);
    return { role, held: installed, resting: false, fallbackRole: null };
  }
  const held = ctx.crew.awake.some((a) => a.role === role);
  const resting = !held && (ctx.crew.resting ?? []).some((a) => a.role === role);
  let fallbackRole: string | null = null;
  if (!held) {
    const taker = pickAgentling(
      ctx.crew.awake.map((a, i) => ({ id: String(i), name: '', color: 0, state: (a.state ?? 'idle') as 'idle', x: 0, targetX: 0, role: a.role, jobsDone: 0, jobsFailed: 0 })),
      role,
    );
    fallbackRole = taker?.role ?? null;
  }
  return { role, held, resting, fallbackRole };
}

const installed = (ctx: CoverageContext, name: string) => ctx.roles.some((r) => r.name === name);

/** One duty, graded. Pure: everything it reads is in the context. */
export function gradeTask(ctx: CoverageContext, task: WorkTask): TaskCoverage {
  const text = task.text;
  const found = ctx.index.search(text);
  const top = found.roles[0];
  const confident = !!top && found.confidence >= MIN_CONFIDENCE;
  const lexicalRole = confident && installed(ctx, top.name) ? top.name : null;
  const reasons: string[] = [];
  const powersHit: string[] = [];
  const boundariesHit: string[] = [];
  const missing = { skills: [] as string[], tools: [] as string[], connections: [] as string[] };
  const alternatives = found.roles.map((r) => r.name);

  let grade: TaskGrade = 'uncovered';
  let gap: GapKind | null = 'matcher';
  let evidence: TaskCoverage['evidence'] = 'none';
  let role: string | null = null;
  let doorExists: boolean | undefined;
  let notThisCrew = false;

  // 1. Boundaries. A hard one decides the duty; a soft one decides only if no
  //    power vouches for the rest of the duty.
  const hard = BOUNDARIES.filter((b) => b.hard && boundaryHits(text, b).length > 0);
  const soft = BOUNDARIES.filter((b) => !b.hard && boundaryHits(text, b).length > 0);
  for (const b of [...hard, ...soft]) {
    boundariesHit.push(b.id);
    reasons.push(`${b.id}: ${boundaryHits(text, b).join(', ')} — ${b.why}`);
  }
  const needsOf = (b: Boundary) => {
    if (b.door) missing.connections.push(b.door);
    else if (b.gap === 'door') missing.connections.push('(no door exists)');
  };

  // 2. Powers.
  const powers = POWERS.filter((p) => powerHits(text, p).length > 0);
  for (const p of powers) {
    powersHit.push(p.id);
    reasons.push(`${p.id}: ${powerHits(text, p).join(', ')} — ${p.why}`);
  }

  if (hard.length > 0) {
    // A hard boundary decides the duty whole. A power firing beside it is
    // the object, not the work — "pay supplier invoices" is the payment,
    // and the invoice word must not make it partly the analyst's — so the
    // power is recorded for the reader and buys nothing. Measured on the
    // first fixture: the rule "power beside a boundary means partial" read
    // that duty as half done.
    const b = hard[0];
    grade = 'uncovered';
    gap = b.gap;
    evidence = 'boundary';
    notThisCrew = true;
    doorExists = b.gap === 'door' ? false : undefined;
    needsOf(b);
    if (powers.length > 0) {
      reasons.push(`${powers.map((p) => p.id).join(', ')} fired too; split that part out as its own job and the crew can take it`);
    }
  } else if (powers.length > 0 && thin(text, powers, lexicalRole)) {
    // One bare word is not a power. Measured on the release: "projection"
    // covered "clean the projection booth", "data" covered "decrypt seized
    // data". A power vouches only on two hits, a phrase, or the matcher
    // naming — on its own evidence — a trade the power carries. Unverified.
    role = chooseRole(ctx, text, powers, lexicalRole);
    grade = 'partial';
    gap = 'matcher';
    evidence = 'lexical';
    const word = powers.flatMap((p) => powerHits(text, p))[0];
    reasons.push(`one word (${word}) reaches ${powers[0].id} and nothing else vouches for the duty — too thin to call covered, not a capability verdict`);
  } else if (powers.length > 0) {
    role = chooseRole(ctx, text, powers, lexicalRole);
    evidence = 'power';
    const closed = powers
      .flatMap((p) => p.needs ?? [])
      .filter((door, i, all) => all.indexOf(door) === i)
      .filter((door) => !ctx.doors.some((d) => d.name === door && d.open));
    const partialPower = powers.every((p) => p.kind === 'partial');
    if (closed.length > 0) {
      grade = 'partial';
      gap = 'door';
      doorExists = closed.every((door) => ctx.doors.some((d) => d.name === door));
      missing.connections.push(...closed);
      reasons.push(`the ${closed.join(' and ')} door${closed.length > 1 ? 's are' : ' is'} ${doorExists ? 'closed — connect it in Settings' : 'not in the catalog'}`);
    } else if (soft.length > 0) {
      grade = 'partial';
      gap = soft[0].gap;
      doorExists = soft[0].door ? ctx.doors.some((d) => d.name === soft[0].door) : undefined;
      needsOf(soft[0]);
    } else if (partialPower) {
      grade = 'partial';
      gap = 'capability';
    } else {
      grade = 'covered';
      gap = null;
    }
  } else if (soft.length > 0) {
    // Only a soft boundary fired: the duty is the approval-time half of
    // something, or a watch. Partial on the boundary's word, nobody vouches
    // for the rest.
    grade = 'partial';
    gap = soft[0].gap;
    evidence = 'boundary';
    doorExists = soft[0].door ? ctx.doors.some((d) => d.name === soft[0].door) : undefined;
    needsOf(soft[0]);
    role = lexicalRole;
  } else if (lexicalRole) {
    // The words reach a role and nothing recorded vouches for the duty. A
    // matcher gap on purpose (D-229): not a hiring recommendation, and not a
    // capability verdict either.
    grade = 'partial';
    gap = 'matcher';
    evidence = 'lexical';
    role = lexicalRole;
    reasons.push(`the words reach ${lexicalRole} at ${found.confidence} (${found.matchedTerms.join(', ') || 'no term'}) but no recorded power vouches for the duty — unverified, not a capability verdict`);
  } else {
    grade = 'uncovered';
    gap = 'matcher';
    evidence = 'none';
    reasons.push(
      found.gaps.length > 0
        ? `not understood: ${found.gaps.join(', ')} — nothing installed uses these words (confidence ${found.confidence})`
        : `understood but unclaimed: no role scored above ${MIN_CONFIDENCE} (confidence ${found.confidence}) and no recorded power or boundary names the duty`,
    );
  }

  // 3. Roster: a covered duty whose role nobody awake holds. Only a covered
  //    one — an unverified word match relabelled as a roster gap would say
  //    "<role> covers this" on evidence that never vouched.
  if (role && grade === 'covered') {
    const roster = rosterState(ctx, role);
    if (!roster.held) {
      grade = 'partial';
      gap = 'roster';
      reasons.push(
        roster.resting
          ? `${role} covers this but your ${role} is resting — wake them${roster.fallbackRole ? `, or your ${roster.fallbackRole} takes it as their own role` : ''}`
          : `${role} covers this but nobody in this level is a ${role}${roster.fallbackRole ? ` — your ${roster.fallbackRole} would take it as their own role (D-200)` : ''}`,
      );
    }
  }

  return {
    taskId: task.id,
    sourceId: task.sourceId,
    text,
    required: task.required,
    grade,
    gap,
    evidence,
    role,
    confidence: found.confidence,
    reasons,
    matchedTerms: found.matchedTerms,
    uncoveredTerms: found.gaps,
    powers: powersHit,
    boundaries: boundariesHit,
    missing: {
      skills: missing.skills,
      tools: missing.tools,
      connections: [...new Set(missing.connections)],
    },
    doorExists,
    notThisCrew,
    alternatives: alternatives.filter((a) => a !== role),
  };
}

/** Power evidence too thin to vouch: a single one-word hit, with the matcher not independently naming a trade the power carries. */
function thin(text: string, powers: Power[], lexicalRole: string | null): boolean {
  const hitsAll = powers.flatMap((p) => powerHits(text, p));
  if (hitsAll.length >= 2 || hitsAll.some((t) => t.includes(' '))) return false;
  // The worker's own description — takes any job, masters none — matches any
  // generic sentence and is not evidence of a capability.
  if (!lexicalRole || lexicalRole === 'worker') return true;
  return !powers.some((p) => p.roles.includes('*') || p.roles.includes(lexicalRole));
}

/**
 * The installed trade the firing powers vouch for most: each power's term
 * hits count for the trades it names (a first-named trade counts whole, the
 * rest half), and the matcher's own choice breaks a tie. Array order decides
 * nothing — measured, "develop graphics and layouts for Web sites" went to
 * the researcher on one hit of "web" because research was listed first.
 */
function chooseRole(ctx: CoverageContext, text: string, powers: Power[], lexicalRole: string | null): string | null {
  const score = new Map<string, number>();
  for (const p of powers) {
    const n = powerHits(text, p).length;
    const names = p.roles.includes('*') ? (lexicalRole ? [lexicalRole] : ctx.roles.map((r) => r.name)) : p.roles;
    names.forEach((r, i) => {
      if (installed(ctx, r)) score.set(r, (score.get(r) ?? 0) + (i === 0 ? n : n / 2));
    });
  }
  if (lexicalRole && score.has(lexicalRole)) score.set(lexicalRole, score.get(lexicalRole)! + 0.25);
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ranked[0]?.[0] ?? lexicalRole;
}

/** A whole profile: every duty graded, the role that took most of it, the roster it lands on. */
export function coverage(ctx: CoverageContext, profile: WorkProfile): CoverageResult {
  const tasks = profile.tasks.map((t) => gradeTask(ctx, t));
  const counts: Record<TaskGrade, number> = { covered: 0, partial: 0, uncovered: 0 };
  const gaps: Record<GapKind, number> = { matcher: 0, capability: 0, door: 0, policy: 0, roster: 0 };
  const weight = new Map<string, number>();
  const conf = new Map<string, number[]>();
  const missing = { skills: new Set<string>(), tools: new Set<string>(), connections: new Set<string>() };
  for (const t of tasks) {
    counts[t.grade] += 1;
    if (t.gap) gaps[t.gap] += 1;
    if (t.role) {
      weight.set(t.role, (weight.get(t.role) ?? 0) + (t.required ? 2 : 1));
      (conf.get(t.role) ?? conf.set(t.role, []).get(t.role)!).push(t.confidence);
    }
    t.missing.connections.forEach((c) => missing.connections.add(c));
  }
  const ranked = [...weight.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map((e) => e[0]);
  const role = ranked[0] ?? null;
  const confs = role ? conf.get(role)! : [];
  const confidence = confs.length ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100) / 100 : 0;
  const boundaryOnly = tasks.length > 0 && tasks.every((t) => t.evidence === 'boundary');
  const notThisCrew = counts.covered === 0 && boundaryOnly && tasks.some((t) => t.notThisCrew);

  // The profile's own skill and tool words the crew has no power for — the
  // source's vocabulary, kept verbatim so the benchmark can count it.
  const knows = (s: string) => POWERS.some((p) => powerHits(s, p).length > 0);
  profile.skills.filter((s) => !knows(s)).forEach((s) => missing.skills.add(s));
  profile.tools.filter((s) => !knows(s)).forEach((s) => missing.tools.add(s));

  return {
    profileId: profile.id,
    source: profile.source,
    sourceVersion: profile.sourceVersion,
    occupationId: profile.occupationId,
    title: profile.title,
    role,
    confidence,
    tasks,
    counts,
    gaps,
    roster: rosterState(ctx, role),
    missing: {
      skills: [...missing.skills].sort(),
      tools: [...missing.tools].sort(),
      connections: [...missing.connections].sort(),
    },
    alternatives: ranked.slice(1),
    notThisCrew,
  };
}

/**
 * The one line the app says about a profile — the six messages, told apart
 * by the evidence rather than by a score. Kept beside the grader so every
 * screen that shows a result says the same thing for the same reasons.
 */
export function coverageLine(r: CoverageResult): string {
  const total = r.tasks.length;
  if (total === 0) return 'Nothing to grade: the record lists no duties.';
  const firstGap = (kind: GapKind) => r.tasks.find((t) => t.gap === kind);
  if (r.notThisCrew) {
    const b = r.tasks.find((t) => t.notThisCrew)!;
    const why = boundaryById(b.boundaries[0])?.why ?? b.reasons[0];
    return `This is not this crew: ${why}`;
  }
  if (r.counts.covered === total && r.role) return `This is covered by ${r.role}.`;
  if (r.role && !r.roster.held && r.gaps.roster > 0 && r.counts.covered + r.gaps.roster === total) {
    return r.roster.resting
      ? `A suitable role exists in the library, but your ${r.role} is resting — wake them.`
      : `A suitable role exists in the library, but nobody in this level holds it: hire a ${r.role}.`;
  }
  const door = firstGap('door');
  if (r.role && door && r.counts.covered > 0) {
    const piece = door.missing.connections.filter((c) => c !== '(no door exists)')[0];
    return piece
      ? `This is partly covered by ${r.role}; the missing piece is the ${piece} door.`
      : `This is partly covered by ${r.role}; the missing piece needs a door the app does not have.`;
  }
  const policy = firstGap('policy');
  if (r.role && policy && r.counts.covered > 0) {
    return `This is partly covered by ${r.role}; the rest stops at a boundary — ${boundaryById(policy.boundaries[0])?.why ?? policy.reasons[0]}`;
  }
  if (r.gaps.matcher > 0 && r.gaps.matcher >= total - r.counts.covered) {
    return r.tasks.some((t) => t.evidence === 'none' && t.uncoveredTerms.length > 0)
      ? 'The matcher does not understand these terms yet.'
      : 'The words reach the crew but no recorded power vouches for the duties yet.';
  }
  if (r.counts.covered > 0 && r.role) return `This is partly covered by ${r.role}.`;
  return 'This work is currently uncovered; repeated evidence would suggest a missing role cluster.';
}
