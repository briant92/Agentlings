// The labelled corpus behind `npm run bench:intake`.
//
// Every case is a sentence a person would actually type at the one box, and a
// label saying what the desk *should* make of it. Labels are written from the
// sentence alone — what a careful human reader would answer — never from what
// the code currently does, because a corpus written off the implementation
// measures nothing but its own agreement.
//
// Only the fields present are asserted. A case that says nothing about roles
// is not a role failure; it is a case about something else.

export interface BenchCase {
  id: string;
  family: string;
  prompt: string;
  /** The level has a project folder attached. */
  hasRepo?: boolean;
  /** Connections granted to the job. Default: web (what ships on). */
  tools?: string[];
  expect: {
    /** Steps `splitSteps` should find. `null` means "one job, no split". */
    steps?: number | null;
    /**
     * Every channel the sentence asks to send on, in the order a reader meets
     * them. Two or more is one job on all of them (D-179), so the runner also
     * checks that each is named at the desk and asked its own recipient.
     */
    channels?: string[];
    /**
     * The role that should run it, or null when no role is right. A list where
     * two roles are genuinely defensible — a benchmark that fails a good answer
     * measures the labeller's taste, not the matcher.
     */
    role?: string | null | string[];
    /** The router decision kind, or any of several acceptable ones. */
    tier?: string | string[];
    /** Clarify question ids that must be asked. */
    asks?: string[];
    /** Question ids that must NOT be asked. */
    asksNot?: string[];
    /** The folder picker should appear. */
    organize?: boolean;
    /** The sentence asks for a real file to ride with the message. */
    attaches?: boolean;
    /** The sentence asks for something to be withheld or masked before it goes. */
    redacts?: boolean;
    /** The sentence asks for the job to repeat on a cadence. */
    recurs?: boolean;
  };
  note?: string;
}

export const CASES: BenchCase[] = [
  // ── One channel, one send. The shape the desk was built for. ─────────────
  {
    id: 'send-01',
    family: 'send-single',
    prompt: 'Telegram Pepo the UF and the dollar for today',
    expect: { channels: ['telegram'], steps: null, asks: ['send-to:telegram'], tier: 'agent' },
  },
  {
    id: 'send-02',
    family: 'send-single',
    prompt: 'Email Ana the Q3 expenses summary',
    expect: { channels: ['gmail'], steps: null, asks: ['send-to:gmail'] },
  },
  {
    id: 'send-03',
    family: 'send-single',
    prompt: 'Send a Telegram to Brian saying A DARLE',
    expect: { channels: ['telegram'], steps: null, asks: ['send-to:telegram', 'send-say'] },
  },
  {
    id: 'send-04',
    family: 'send-single',
    prompt: 'Put a dentist appointment on my calendar for Thursday at 6pm',
    expect: { channels: ['calendar'], steps: null, asks: ['send-to:calendar', 'send-say:calendar'] },
  },
  {
    id: 'send-05',
    family: 'send-single',
    prompt: 'Post a comment on github issue 12 explaining why the sweep was excluded',
    expect: { channels: ['github'], steps: null },
  },

  // ── Two channels in one sentence. The scenario this benchmark exists for. ─
  {
    id: 'multi-01',
    family: 'send-multi',
    prompt: 'Telegram Pepo the UF for today and email the same figures to Ana',
    expect: { channels: ['telegram', 'gmail'], steps: null },
    note: 'One task, two recipients, two channels, one body.',
  },
  {
    id: 'multi-02',
    family: 'send-multi',
    prompt: 'Email the board the quarterly numbers and send me a Telegram when it has gone out',
    expect: { channels: ['gmail', 'telegram'], steps: null },
    note: 'The second channel is a receipt for the first, not a second task.',
  },
  {
    id: 'multi-03',
    family: 'send-multi',
    prompt: 'Send the release notes to the team on Slack and email them to the investors',
    expect: { channels: ['slack', 'gmail'], steps: null },
  },
  {
    id: 'multi-04',
    family: 'send-multi',
    prompt:
      'Research this week AI funding rounds, write it up, then email it to Ana and telegram me the headline',
    expect: { channels: ['gmail', 'telegram'], steps: 3 },
    note: 'A chain whose last step is itself two channels.',
  },
  {
    id: 'multi-05',
    family: 'send-multi',
    prompt: 'Book the review on my calendar and email the agenda to everyone invited',
    expect: { channels: ['calendar', 'gmail'], steps: null },
  },

  // ── Chains the user wrote out. ───────────────────────────────────────────
  {
    id: 'chain-01',
    family: 'chain',
    prompt: 'Summarise the expenses CSV, then telegram Brian the total',
    expect: { steps: 2, channels: ['telegram'] },
  },
  {
    id: 'chain-02',
    family: 'chain',
    prompt:
      'Research the Chilean pension reform, then write a two-page brief, then email it to Ana',
    expect: { steps: 3, channels: ['gmail'] },
  },
  {
    id: 'chain-03',
    family: 'chain',
    prompt:
      'Research the competitor pricing, then review the draft for errors, then redact the client names, then email it to the partners',
    expect: { steps: 4, channels: ['gmail'], redacts: true },
    note: 'The headline four-stage scenario: research, review, redact, attach and send.',
  },
  {
    id: 'chain-04',
    family: 'chain',
    prompt: 'Read the contract in input, then write a risk note, then attach it to an email to Ana',
    expect: { steps: 3, channels: ['gmail'], attaches: true },
  },
  {
    id: 'chain-05',
    family: 'chain',
    prompt: 'If the tests pass, then commit the change',
    expect: { steps: null },
    note: 'A consequence, not a sequence — must not split.',
  },
  {
    id: 'chain-06',
    family: 'chain',
    prompt: 'Fix the failing test and then some',
    expect: { steps: null },
    note: 'A fragment the marker tore off.',
  },

  // ── Chains the user wrote without the word "then". ───────────────────────
  {
    id: 'implicit-01',
    family: 'chain-implicit',
    prompt: 'Summarise the expenses CSV and telegram Brian the total',
    expect: { steps: 2, channels: ['telegram'] },
    note: 'Same work as chain-01, joined with "and".',
  },
  {
    id: 'implicit-02',
    family: 'chain-implicit',
    prompt:
      'Look up this week UF values. After that, write them into a table and email it to Ana.',
    expect: { steps: 3, channels: ['gmail'] },
  },
  {
    id: 'implicit-03',
    family: 'chain-implicit',
    prompt:
      '1. Pull the latest indicator figures 2. Check them against the SII page 3. Telegram me the differences',
    expect: { steps: 3, channels: ['telegram'] },
    note: 'A numbered list is as explicit as a sequence marker gets.',
  },
  {
    id: 'implicit-04',
    family: 'chain-implicit',
    prompt: 'First read the PDF, next pull out the figures, finally email me a table',
    expect: { steps: 3, channels: ['gmail'] },
  },

  // ── Files riding with a message. ─────────────────────────────────────────
  {
    id: 'attach-01',
    family: 'attach',
    prompt: 'Write the monthly report as a PDF and email it to Ana as an attachment',
    expect: { channels: ['gmail'], attaches: true },
  },
  {
    id: 'attach-02',
    family: 'attach',
    prompt: 'Send Pepo the contract PDF on Telegram',
    expect: { channels: ['telegram'], attaches: true },
  },
  {
    id: 'attach-03',
    family: 'attach',
    prompt: 'Post the build log file to the team on Slack',
    expect: { channels: ['slack'], attaches: true },
    note: 'Slack cannot carry files — the desk should say so before the run.',
  },
  {
    id: 'attach-04',
    family: 'attach',
    prompt: 'Forward the invoice I attached to Ana by email',
    expect: { channels: ['gmail'], attaches: true },
  },

  // ── Withholding before sending. ──────────────────────────────────────────
  {
    id: 'redact-01',
    family: 'redact',
    prompt: 'Email Ana the incident report with the customer names removed',
    expect: { channels: ['gmail'], redacts: true },
  },
  {
    id: 'redact-02',
    family: 'redact',
    prompt: 'Telegram me the salary table but mask everything except the totals',
    expect: { channels: ['telegram'], redacts: true },
  },
  {
    id: 'redact-03',
    family: 'redact',
    prompt: 'Send the audit findings to the board, leaving out anything confidential',
    expect: { redacts: true },
    note: 'No channel word at all — a send with a withholding instruction and nowhere to go.',
  },

  // ── Which agentling takes it. ────────────────────────────────────────────
  {
    id: 'role-01',
    family: 'route-role',
    prompt: 'Look into what changed in the repo this week and write it up',
    hasRepo: true,
    expect: { role: ['scribe', 'scout'] },
    note: 'Survey then write-up — both roles defensible, so both pass.',
  },
  {
    id: 'role-02',
    family: 'route-role',
    prompt: 'Add tests for the payment module',
    hasRepo: true,
    expect: { role: 'mason' },
  },
  {
    id: 'role-03',
    family: 'route-role',
    prompt: 'Find out what the market expects for data centre power demand in 2030, with sources',
    expect: { role: 'researcher' },
  },
  {
    id: 'role-04',
    family: 'route-role',
    prompt: 'Check this CSV for anomalies and give me the figures in a table',
    expect: { role: 'analyst' },
  },
  {
    id: 'role-05',
    family: 'route-role',
    prompt: 'Sort the downloads folder into subfolders by kind',
    expect: { role: 'worker', organize: true },
  },
  {
    id: 'role-06',
    family: 'route-role',
    prompt: 'Draw me a diagram of how the router decides a tier',
    expect: { role: 'architect' },
    note: 'Architect owns dependency diagrams; designer owns how a thing looks.',
  },
  {
    id: 'role-06b',
    family: 'route-role',
    prompt: 'Redraw the level background so the sky reads warmer at dusk',
    expect: { role: 'designer' },
  },
  {
    id: 'role-07',
    family: 'route-role',
    prompt: 'Decide whether we should store jobs in SQLite or keep them on disk, and why',
    expect: { role: 'architect' },
  },
  {
    id: 'role-08',
    family: 'route-role',
    prompt: 'Have a look around the codebase and tell me where the sending happens',
    hasRepo: true,
    expect: { role: 'scout' },
  },
  {
    id: 'role-09',
    family: 'route-role',
    prompt: 'sort out the thing with the stuff',
    expect: { role: null },
    note: 'Nothing understandable — the desk must decline rather than guess.',
  },

  // ── What tier the work belongs in. ───────────────────────────────────────
  {
    id: 'tier-01',
    family: 'route-tier',
    prompt: 'read https://example.com/pricing',
    expect: { tier: 'fetch' },
  },
  {
    id: 'tier-02',
    family: 'route-tier',
    prompt: 'search for pages about the UF index',
    tools: ['web', 'search'],
    expect: { tier: 'search' },
  },
  {
    id: 'tier-03',
    family: 'route-tier',
    prompt: 'search for the best typescript orm',
    tools: ['web', 'search'],
    expect: { tier: 'agent' },
    note: 'Asks for a judgement — the free tier must not answer it.',
  },
  {
    id: 'tier-04',
    family: 'route-tier',
    prompt: 'read https://example.com/report and tell me what it says about pricing',
    expect: { tier: 'agent' },
  },
  {
    id: 'tier-05',
    family: 'route-tier',
    prompt: 'What did we learn about the BLS quota?',
    expect: { tier: 'agent' },
    note: 'Recall on a cold level: nothing on file, so it must fall through.',
  },

  // ── Sentences that must not fire anything. ───────────────────────────────
  {
    id: 'trap-01',
    family: 'traps',
    prompt: 'Summarise the mail export in input/',
    expect: { channels: [], steps: null },
    note: '"mail" as a noun about a file, not a channel.',
  },
  {
    id: 'trap-02',
    family: 'traps',
    prompt: 'Send a signal to the process when the build finishes',
    hasRepo: true,
    expect: { channels: [] },
  },
  {
    id: 'trap-03',
    family: 'traps',
    prompt: 'Write a test for the telegram module',
    hasRepo: true,
    expect: { channels: [] },
  },
  {
    id: 'trap-04',
    family: 'traps',
    prompt: 'Read the comments on github issue 5 and summarise the argument',
    expect: { channels: [] },
  },
  {
    id: 'trap-05',
    family: 'traps',
    prompt: 'Sen me a Telegram with the UF',
    expect: { channels: ['telegram'] },
    note: 'A typo in the send verb once turned an 80c send into research (D-093).',
  },
  {
    id: 'trap-06',
    family: 'traps',
    prompt: 'Fix it',
    hasRepo: true,
    expect: { asks: ['subject'] },
  },
  {
    id: 'trap-07',
    family: 'traps',
    prompt: 'Produce a PDF',
    expect: { asks: ['about'] },
  },

  // ── "Every Monday" — a cadence written in the sentence. ──────────────────
  {
    id: 'recur-01',
    family: 'recurring',
    prompt: 'Every Monday at 9, telegram me the UF and the dollar',
    expect: { channels: ['telegram'], recurs: true },
  },
  {
    id: 'recur-02',
    family: 'recurring',
    prompt: 'Email me the open PR list every morning',
    expect: { channels: ['gmail'], recurs: true },
  },
];
