import { describe, expect, it } from 'vitest';
import {
  capabilityTokens,
  compileBlockers,
  compileDoors,
  connectionsIn,
  connectionsUsed,
  sameSurface,
} from './capability';

describe('connectionsIn', () => {
  const surface = capabilityTokens({
    connections: ['web', 'github', 'browser'],
    tools: ['Read', 'Write'],
    skills: ['cite-sources'],
  });

  it('reads the connections back out of a surface', () => {
    expect(connectionsIn(surface).sort()).toEqual(['browser', 'github', 'web']);
  });

  /**
   * The distinction the compile gate turns on. `web` ships on, so it is in
   * almost every surface including recipes that never fetched anything —
   * `anchor2`, five deliveries of writing a note, carries it. Treating that as
   * "needed the network" would refuse the most promotable recipe in the level
   * for a reason that is not true. What the user switched on deliberately is
   * the part that carries information. (D-044)
   */
  it('drops the connections that are on by default', () => {
    expect(connectionsIn(surface, ['web']).sort()).toEqual(['browser', 'github']);
  });

  it('leaves nothing when only ambient connections were available', () => {
    const plain = capabilityTokens({ connections: ['web'], tools: ['Read'] });
    expect(connectionsIn(plain, ['web'])).toEqual([]);
  });

  // Every recipe written before surfaces existed, and the two that compiled.
  it('says nothing was needed when no surface was recorded', () => {
    expect(connectionsIn(undefined, ['web'])).toEqual([]);
  });
});

/**
 * D-036 closed one axis — the connections a job could reach — and left the
 * rest open. These are the others: a role's tools, its skills, and the
 * libraries a sandbox can resolve. Each of them changes what a good method is,
 * and each used to change nothing.
 */
describe('capabilityTokens', () => {
  it('prefixes each axis so two of them can never collide', () => {
    expect(capabilityTokens({ connections: ['web'], tools: ['web'] })).toEqual([
      'conn:web',
      'tool:web',
    ]);
  });

  it('sorts, so the same surface described in any order is the same surface', () => {
    const a = capabilityTokens({ connections: ['web', 'browser'], tools: ['Read', 'Bash'] });
    const b = capabilityTokens({ tools: ['Bash', 'Read'], connections: ['browser', 'web'] });
    expect(a).toEqual(b);
  });

  it('is empty for a run that could do nothing', () => {
    expect(capabilityTokens({})).toEqual([]);
  });
});

describe('sameSurface', () => {
  const base = capabilityTokens({
    connections: ['web'],
    tools: ['Read', 'Bash'],
    skills: ['cite-sources'],
    libraries: ['pdf-lib'],
  });

  it('is true for an identical surface', () => {
    expect(sameSurface(base, [...base])).toBe(true);
  });

  // The axis measured in D-031: an agentling that did not know pdf-lib existed
  // hand-assembled PDF bytes over several turns, and succeeded — which is what
  // made it expensive rather than obviously wrong. A method written then should
  // not still be shortening runs now the library is installed.
  it('is false once a library is installed', () => {
    const grown = capabilityTokens({
      connections: ['web'],
      tools: ['Read', 'Bash'],
      skills: ['cite-sources'],
      libraries: ['pdf-lib', 'docx'],
    });
    expect(sameSurface(base, grown)).toBe(false);
  });

  it('is false when the role gains or loses a tool', () => {
    const noBash = capabilityTokens({
      connections: ['web'],
      tools: ['Read'],
      skills: ['cite-sources'],
      libraries: ['pdf-lib'],
    });
    expect(sameSurface(base, noBash)).toBe(false);
  });

  it('is false when a skill is added', () => {
    const extra = capabilityTokens({
      connections: ['web'],
      tools: ['Read', 'Bash'],
      skills: ['cite-sources', 'small-diffs'],
      libraries: ['pdf-lib'],
    });
    expect(sameSurface(base, extra)).toBe(false);
  });

  // Unknown provenance is treated as changed rather than assumed to match.
  it('is false when either side is unknown', () => {
    expect(sameSurface(undefined, base)).toBe(false);
    expect(sameSurface(base, undefined)).toBe(false);
    expect(sameSurface(undefined, undefined)).toBe(false);
  });

  it('is true for two runs that could both do nothing', () => {
    expect(sameSurface([], [])).toBe(true);
  });
});

/**
 * Which connections a method actually reached (D-100). D-044 could only ask
 * what was *available* — "the surface cannot say whether it did" — and named
 * the price: a connection somebody switched on rides every recipe learned
 * since. Measured before this existed, three of the seven recipes eligible to
 * compile were refused for carrying `browser`, and none had opened one.
 */
describe('connectionsUsed', () => {
  const CATALOG = [
    { name: 'web', tools: ['fetch_page'] },
    { name: 'github', tools: ['list_commits', 'read_file'] },
    { name: 'search', tools: ['search_web'] },
    { name: 'browser', tools: ['navigate', 'read_page'] },
    { name: 'telegram', tools: [] },
  ];

  it('reports nothing when a run reached for nothing', () => {
    expect(connectionsUsed(['Read', 'Write', 'Bash'], CATALOG)).toEqual([]);
  });

  it('names a builtin connection from the tool it lends', () => {
    expect(connectionsUsed(['Read', 'list_commits', 'Write'], CATALOG)).toEqual(['github']);
  });

  // An stdio connection's tools arrive under the SDK's own prefix.
  it('names a connection through its mcp prefix', () => {
    expect(connectionsUsed(['mcp__browser__navigate'], CATALOG)).toEqual(['browser']);
  });

  it('names every one that was reached, not just the first', () => {
    expect(connectionsUsed(['fetch_page', 'search_web', 'Read'], CATALOG)).toEqual([
      'web',
      'search',
    ]);
  });

  /**
   * The gain over reading availability, stated as a test: `web` is subtracted
   * from a *surface* because it is on everywhere and says nothing. A run that
   * genuinely called `fetch_page` has said something, and this reports it —
   * which closes D-044's own stated limit, that a job fetching a page with
   * nothing but `web` passed the gate and produced a failing compile.
   */
  it('reports an ambient connection when it was really used', () => {
    expect(connectionsUsed(['fetch_page'], CATALOG)).toEqual(['web']);
    expect(connectionsIn(['conn:web'], ['web'])).toEqual([]); // the old question
  });

  // The case that bought this: the surface says browser, the run says no.
  it('clears a method that carried a connection it never touched', () => {
    const surface = ['conn:browser', 'conn:github', 'conn:web'];
    expect(connectionsIn(surface, ['web'])).toEqual(['browser', 'github']);
    expect(connectionsUsed(['Read', 'Write', 'Bash'], CATALOG)).toEqual([]);
  });

  it('says nothing at all when the runs predate the recording', () => {
    expect(connectionsUsed(undefined, CATALOG)).toEqual([]);
    expect(connectionsUsed([], CATALOG)).toEqual([]);
  });
});

/**
 * The compile gate's question, extracted from the route so it is testable at
 * all (D-100). Both halves matter: reading use where there is use, and
 * refusing to read silence as innocence where there is not.
 */
describe('compileBlockers', () => {
  const CATALOG = [
    { name: 'web', tools: ['fetch_page'], defaultOn: true },
    { name: 'github', tools: ['list_commits'] },
    { name: 'browser', tools: ['navigate'] },
  ];

  /** The case that bought D-100: the surface says browser, the run says no. */
  it('clears a method that carried a connection it never touched', () => {
    expect(
      compileBlockers(
        { capabilities: ['conn:browser', 'conn:github', 'conn:web'], usedTools: ['Read', 'Write'] },
        CATALOG,
      ),
    ).toEqual([]);
  });

  /**
   * The refusal D-100 wrote and the one it reopened, side by side. Reaching the
   * code host was the canonical "could never be a script" case for two
   * decisions running; it is a grant now, because there is a door to hand over.
   * What has not changed is the answer for anything without one.
   */
  it('no longer refuses a method whose reach has a door', () => {
    const reachedGithub = {
      capabilities: ['conn:github', 'conn:web'],
      usedTools: ['Read', 'list_commits'],
    };
    expect(compileBlockers(reachedGithub, CATALOG)).toEqual([]);
    expect(compileDoors(reachedGithub, CATALOG)).toEqual(['github']);
  });

  it('still refuses a method that reached something with no door', () => {
    const reachedBrowser = { capabilities: ['conn:browser'], usedTools: ['navigate'] };
    expect(compileBlockers(reachedBrowser, CATALOG)).toEqual(['browser']);
    expect(compileDoors(reachedBrowser, CATALOG)).toEqual([]);
  });

  /** A method can need one of each, and each half must report only its own. */
  it('splits a method that reached both', () => {
    const both = {
      capabilities: ['conn:browser', 'conn:github'],
      usedTools: ['navigate', 'list_commits'],
    };
    expect(compileBlockers(both, CATALOG)).toEqual(['browser']);
    expect(compileDoors(both, CATALOG)).toEqual(['github']);
  });

  /**
   * D-044's other stated limit, closed by D-100 and now answered differently
   * again: a job that genuinely fetched with nothing but the ambient `web` is
   * still *detected* — that was the gain and it is intact — but detecting it
   * now grants the fetch door instead of refusing the compile.
   */
  it('grants the ambient connection when the method really used it', () => {
    const fetched = { capabilities: ['conn:web'], usedTools: ['fetch_page'] };
    expect(compileBlockers(fetched, CATALOG)).toEqual([]);
    expect(compileDoors(fetched, CATALOG)).toEqual(['web']);
    // And still tells the two apart: available-but-unused grants nothing.
    expect(compileDoors({ capabilities: ['conn:web'], usedTools: ['Read'] }, CATALOG)).toEqual([]);
  });

  // Silence is not innocence: a recipe whose runs predate the recording gets
  // the old, careful answer rather than a free pass.
  it('falls back to the surface when no run ever reported', () => {
    expect(compileBlockers({ capabilities: ['conn:browser', 'conn:web'] }, CATALOG)).toEqual([
      'browser',
    ]);
    expect(compileBlockers({ capabilities: ['conn:browser'], usedTools: [] }, CATALOG)).toEqual([
      'browser',
    ]);
  });

  it('clears a method that reached nothing and was learned reaching nothing', () => {
    expect(compileBlockers({ capabilities: ['conn:web'], usedTools: ['Read'] }, CATALOG)).toEqual([]);
  });

  /**
   * Silence stays careful on both sides. A recipe whose runs predate the
   * recording tells us nothing, so the surface answers — and a surface is
   * availability, which must not become a *grant*: handing a tool the fetch
   * door because `web` was merely switched on when the method was found would
   * be the availability-for-use substitution D-100 spent a decision undoing.
   */
  it('grants nothing on a surface the runs never confirmed, and blocks instead', () => {
    const unreported = { capabilities: ['conn:github', 'conn:web'] };
    expect(compileDoors(unreported, CATALOG)).toEqual([]);
    // And so this must still refuse. Clearing it here while granting no door
    // would compile a tool that cannot reach the code host it was written for.
    expect(compileBlockers(unreported, CATALOG)).toEqual(['github']);
  });
});
