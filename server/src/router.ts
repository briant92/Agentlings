import type { Job } from '@agentlings/shared';
import { findRecipe, terms, type Recipe } from './recipes';
import { findTool, type ToolManifest } from './tools';
import { wantsWithholding } from './redact';
import { extractUrls } from './web';

/**
 * Lever 1: plain code deciding whether the agent runs at all. Every request
 * that never reaches query() costs nothing, so this is the largest saving
 * available — and the most dangerous, because an answer given without the
 * agent is an answer nobody checked.
 *
 * So the rule here is: never guess. The router only claims work whose shape
 * it recognises exactly, and everything else falls through to a session. A
 * missed saving costs money; a wrong answer costs trust.
 */

export type Decision =
  | { kind: 'answer'; summary: string; body: string; reason: string; recipeKey?: string }
  | { kind: 'fetch'; urls: string[]; reason: string }
  /** A bare "find me pages about X" — the links, with nothing read or judged. */
  | { kind: 'search'; query: string; reason: string }
  | { kind: 'oneshot'; approach: string; reason: string; recipeKey: string }
  /** Work compiled into a script; runs in code, for nothing. */
  | { kind: 'tool'; toolName: string; reason: string }
  /** A send the desk holds whole — recipient and words both (D-097). */
  | { kind: 'compose'; channel: string; to: string; words: string; reason: string }
  /** A full session, optionally started from a method that half-fits. */
  | { kind: 'agent'; approach?: string; recipeKey?: string };

export interface RouterContext {
  /** What the crew earned: one line per finished job. */
  knowledge: string[];
  /**
   * Your own material, synced and indexed (D-047). Kept apart from `knowledge`
   * rather than merged upstream for one reason: `recallSignal` counts the
   * crew's own notes, and folding these in would redefine what that counter
   * means halfway through the measurement it was built for.
   *
   * Empty when the index is stale, which is how the staleness guard reaches
   * here — a stale store simply has nothing to match, so the free tier cannot
   * answer from it.
   */
  store?: string[];
  recipes: Recipe[];
  /** Compiled tools this level has earned. Empty until one is promoted. */
  tools?: ToolManifest[];
  /** Set when the job opted into web access. */
  canFetch: boolean;
  /** Set when the search connection is granted to this job. */
  canSearch?: boolean;
  /** What this run can do, so a method found under a different surface
   *  hands over its hint without also shortening the leash. */
  capabilities?: string[];
}

/** "What did we learn about X" — a question about the past, not new work. */
const RECALL =
  /^\s*(what (did|do) (we|you|the crew) (learn|know|find)|what do we know|remind me|tell me what (we|you) know)/i;

/** Verbs that mean "put this in front of me", with no analysis asked for. */
const FETCH_ONLY = new Set([
  'read',
  'fetch',
  'get',
  'grab',
  'save',
  'download',
  'pull',
  'open',
  'page',
  'pages',
  'link',
  'links',
  'url',
  'site',
  'this',
  'these',
  'from',
  'and',
  'the',
  'me',
  'for',
  'please',
  'it',
]);

/**
 * The recall question's own vocabulary, which must never be what makes a note
 * relevant.
 *
 * "What do we know about X" carries `know` into the scored terms, and `know` is
 * not a stopword — so any note containing it matched, and one shared word is
 * all `relevantLines` ever required. Measured on the real `hq` level: "what do
 * we know about quantum tunnelling" scored 1 of 86 notes, sharing exactly
 * `['know']`, and was answered *free* from a note about `EXPORTS.md`. The free
 * tier's whole promise is "never guess", and it was guessing on the one word
 * guaranteed to be in every question that reaches it.
 *
 * Built by running `terms` over the words rather than written out stemmed, so
 * it cannot drift from the stemmer the way a hand-stemmed list would.
 */
const ASKING = new Set(
  terms('know knows known knowing learn learns learned learnt find finds remind reminds tell tells'),
);

/**
 * Knowledge lines that share the most words with the question, best first.
 *
 * Scored on what the question is *about*: the asking words are dropped first,
 * so a question whose subject appears nowhere on file matches nothing and the
 * job falls through to a session that can go and look.
 */
export function relevantLines(lines: string[], query: string, limit = 6): string[] {
  const wanted = new Set(terms(query).filter((t) => !ASKING.has(t)));
  // A question with no subject left — "what do we know" — is not a question
  // this tier can answer, and showing it something anyway would be the guess.
  if (wanted.size === 0) return [];
  return lines
    .map((line) => ({ line, score: terms(line).filter((t) => wanted.has(t)).length }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.line);
}

/**
 * Question-shaped: a leading interrogative, or a question mark anywhere.
 *
 * Deliberately tighter than `RECALL`, which recognises only the handful of
 * phrasings the free tier dares answer on. This one is a measurement rather
 * than a routing decision, so it can afford to be broad — but not so broad
 * that imperatives fall in: a leading bare "do"/"can" would match "do the
 * dishes", so only wh-words lead. "do we have a deploy doc" with no question
 * mark is therefore missed, which understates rather than inflates.
 */
const QUESTION = /\?|^\s*(what|why|how|when|where|which|who|whose)\b/i;

/**
 * The two facts a paid run can cheaply record about whether it was recall:
 * whether the user asked something, and how many of this level's own notes
 * bear on it at all.
 *
 * Recorded and deliberately not read — the same bargain as `LedgerEntry`'s
 * `compile`, and for the same reason: a rate can be computed from a ledger
 * whenever there is finally enough of it, and a ledger cannot be given a
 * field it never wrote. What counts as "recall-only" is a bar nobody can
 * place yet, so this stores the raw signal and leaves the bar to a query
 * over real traffic (D-046).
 */
export interface RecallSignal {
  asked: boolean;
  /** Notes sharing at least one term with the prompt. Uncapped, unlike the
   *  eight a session is actually given. */
  recallable: number;
}

export function recallSignal(prompt: string, knowledge: string[]): RecallSignal {
  return {
    asked: QUESTION.test(prompt),
    // The same scorer the recall tier and the session context both use, asked
    // for all of them rather than the top few — one notion of "a note that
    // bears on this job", not a second one that could drift from it.
    recallable: relevantLines(knowledge, prompt, knowledge.length).length,
  };
}

/**
 * A prompt that opens by asking for a search, and the subject it asks about.
 *
 * Mirrors `isFetchOnly`: the tier may claim a job only when the whole request
 * is "put this in front of me". The difference is that a query is arbitrary
 * text, so the allowlist cannot cover the subject — instead the *lead* must be
 * a search instruction and the remainder must not turn the search into a
 * question about its own results.
 */
const SEARCH_LEAD =
  /^\s*(?:please\s+)?(?:can\s+you\s+)?(?:do\s+a\s+|run\s+a\s+)?(?:web\s+)?(?:search|look\s*up|find)\s+(?:the\s+web\s+|online\s+|me\s+)?(?:for\s+|pages?\s+(?:for|about|on)\s+|links?\s+(?:for|about|on)\s+|about\s+)?/i;

/**
 * Words that mean the user wants something done *with* the results.
 *
 * A blocklist, and deliberately generous: a real query containing one of these
 * — "search for the best typescript orm" — simply falls through and costs a
 * session. That is the safe direction. The router's rule is that a missed
 * saving costs money and a wrong answer costs trust, and handing back a list
 * of links to someone who asked a question is a wrong answer given for free.
 */
const WANTS_MORE = new Set([
  'and', 'then', 'also', 'plus', 'after', 'afterwards',
  'summarise', 'summarize', 'summary', 'explain', 'compare', 'analyse', 'analyze',
  'why', 'how', 'what', 'which', 'who', 'when', 'whether',
  'tell', 'give', 'answer', 'decide', 'recommend', 'suggest', 'choose', 'pick',
  'best', 'should', 'write', 'report', 'list', 'check', 'verify', 'confirm',
]);

export function searchQuery(prompt: string): string | null {
  const lead = SEARCH_LEAD.exec(prompt);
  if (!lead) return null;
  const rest = prompt.slice(lead[0].length).trim().replace(/[?.!]+$/, '').trim();
  if (!rest) return null;
  const words = rest
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);
  if (words.length === 0) return null;
  if (words.some((w) => WANTS_MORE.has(w))) return null;
  return rest;
}

/** True when the prompt is only addresses and words meaning "fetch". */
export function isFetchOnly(prompt: string, urls: string[]): boolean {
  if (urls.length === 0) return false;
  let rest = prompt;
  for (const url of urls) rest = rest.split(url).join(' ');
  const words = rest
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);
  return words.length > 0 && words.every((w) => FETCH_ONLY.has(w));
}

export function decide(job: Job, context: RouterContext): Decision {
  const prompt = job.prompt ?? '';

  /**
   * A sentence asking for something to be kept out never takes a shortcut
   * (D-181). Every tier below the session either replays text decided before
   * the instruction existed — a banked answer, a compiled tool's output — or
   * copies words the desk is holding, and none of them can withhold anything:
   * they would send the unredacted thing at the speed of free and the review
   * would show a send nobody judged.
   *
   * Measured before it was built: all four withholding sentences in the
   * benchmark corpus happen to route to `agent` today. That is an accident of
   * those sentences, not a guard — the first recipe or compiled tool to claim
   * one would remove it — so the guard is written down.
   */
  const withholding = wantsWithholding(prompt);

  // Mid-flight work — a continuation, or a reply — carries its sandbox
  // forward, and every shortcut below starts from nothing: a stored answer
  // would replay instead of resuming, a compiled tool would redo the job from
  // scratch, and a five-turn leash is absurd for work that has just proved it
  // does not fit its full budget (D-074). A matching recipe still lends its
  // method, and carries its key so the run is recorded and priced as a run of
  // that job (D-072).
  if (job.continues) {
    const found = findRecipe(context.recipes, prompt, context.capabilities);
    return found
      ? { kind: 'agent', approach: found.recipe.approach, recipeKey: found.recipe.key }
      : { kind: 'agent' };
  }

  // Both facts of a send, already in hand, and words the desk promised to
  // send as written. Composing them is copying two strings into a file — the
  // clearest case in the product of work that never needed a model, and it
  // sat in the paid tier because the desk asked for a gist instead of the
  // message. Sending is still not happening here: this writes the outbox the
  // session would have written, and approval remains the send (D-075, D-097).
  // Exactly one channel: the desk holds one recipient and one message (D-097),
  // so a job carrying two has nothing composed for the second and must go to a
  // session that can write both (D-179). Silently composing the first would
  // send half of what was asked for and call it free.
  if (job.send && job.channels?.length === 1 && !withholding) {
    return {
      kind: 'compose',
      channel: job.channels[0],
      to: job.send.to,
      words: job.send.words,
      reason: 'you wrote the message yourself',
    };
  }

  // A question about what the crew already knows is answerable from the file
  // the crew already wrote. No session, no tokens.
  if (RECALL.test(prompt) && !withholding) {
    // The crew's own notes and your indexed material are one corpus here: both
    // are lines on file, scored the same way. A store line carries its source
    // and sync date inside the line, so an answer built from them says where
    // each came from without this branch knowing a store exists.
    const lines = relevantLines([...context.knowledge, ...(context.store ?? [])], prompt);
    if (lines.length > 0) {
      return {
        kind: 'answer',
        summary: `Answered from what this level already knew (${lines.length} notes).`,
        body: [
          '# What we already know',
          '',
          ...lines.map((line) => `- ${line}`),
          '',
          'Answered from what this level has on file — no agentling session was needed.',
        ].join('\n'),
        reason: 'a question about what we already know',
      };
    }
  }

  // "Read this page" is a fetch. Doing it in code costs nothing; asking an
  // agent to do it costs a session that ends by pasting the page back.
  const urls = extractUrls(prompt, 5);
  if (context.canFetch && isFetchOnly(prompt, urls)) {
    return { kind: 'fetch', urls, reason: 'just fetching pages' };
  }

  // "Find me pages about X" is the same shape as "read this page": the answer
  // is the links, and a session would spend a turn producing what one call
  // already returns. Only when nothing is asked *about* the results — see
  // `searchQuery` — and only when an address was not given, since a prompt
  // carrying a URL is a fetch and not a search.
  if (context.canSearch && urls.length === 0) {
    const query = searchQuery(prompt);
    if (query) return { kind: 'search', query, reason: 'just looking for pages' };
  }

  // Ahead of every recipe tier: if this job has been compiled, run the
  // compilation. The shape has to match as well as the words — a tool written
  // against a clone is simply wrong where there is no clone, and the two jobs
  // can be worded identically. And the doors have to still be open: a tool
  // compiled against a connection this job does not hold would fail at its
  // first call, twice, and retire itself over a setting the user changed on
  // purpose.
  const tool = withholding
    ? null
    : findTool(context.tools ?? [], prompt, Boolean(job.repoPath), job.tools ?? []);
  if (tool) {
    return {
      kind: 'tool',
      toolName: tool.name,
      reason: 'the crew has done this often enough to have written a tool for it',
    };
  }

  // The job's own connections, so a method found without them cannot shorten
  // a run that now has them — the crew has to be able to notice it has grown.
  const found = findRecipe(context.recipes, prompt, context.capabilities);
  if (found) {
    // Only an exact repeat with no outside inputs may reuse an answer: the
    // same words with a different repository is a different question.
    // A banked answer is text decided before this instruction existed, so it
    // cannot have withheld anything (D-181) — the method may still ride.
    if (found.exact && found.recipe.answer && !job.repoPath && urls.length === 0 && !withholding) {
      return {
        kind: 'answer',
        summary: 'Answered from the last time this exact job was done.',
        body: found.recipe.answer,
        reason: 'this exact job has been done before',
        recipeKey: found.recipe.key,
      };
    }
    // Otherwise the saving is skipping the exploring, not the thinking.
    if (found.strong) {
      return {
        kind: 'oneshot',
        approach: found.recipe.approach,
        reason: 'the crew has done this kind of job before',
        recipeKey: found.recipe.key,
      };
    }
    // A half-match is worth the method and nothing else. Handing it over costs
    // a paragraph of prompt the session can ignore; shortening the run on the
    // strength of it would cost the whole run when the guess is wrong.
    return { kind: 'agent', approach: found.recipe.approach, recipeKey: found.recipe.key };
  }

  return { kind: 'agent' };
}
