import type { Job } from '@agentlings/shared';
import { findRecipe, terms, type Recipe } from './recipes';
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
  | { kind: 'oneshot'; approach: string; reason: string; recipeKey: string }
  /** A full session, optionally started from a method that half-fits. */
  | { kind: 'agent'; approach?: string; recipeKey?: string };

export interface RouterContext {
  knowledge: string[];
  recipes: Recipe[];
  /** Set when the job opted into web access. */
  canFetch: boolean;
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

/** Knowledge lines that share the most words with the question, best first. */
export function relevantLines(lines: string[], query: string, limit = 6): string[] {
  const wanted = new Set(terms(query));
  if (wanted.size === 0) return [];
  return lines
    .map((line) => ({ line, score: terms(line).filter((t) => wanted.has(t)).length }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.line);
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

  // A question about what the crew already knows is answerable from the file
  // the crew already wrote. No session, no tokens.
  if (RECALL.test(prompt)) {
    const lines = relevantLines(context.knowledge, prompt);
    if (lines.length > 0) {
      return {
        kind: 'answer',
        summary: `Answered from what this level already knew (${lines.length} notes).`,
        body: [
          '# What we already know',
          '',
          ...lines.map((line) => `- ${line}`),
          '',
          'Answered from the level\'s own notes — no agentling session was needed.',
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

  const found = findRecipe(context.recipes, prompt);
  if (found) {
    // Only an exact repeat with no outside inputs may reuse an answer: the
    // same words with a different repository is a different question.
    if (found.exact && found.recipe.answer && !job.repoPath && urls.length === 0) {
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
