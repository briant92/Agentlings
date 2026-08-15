import type { Http } from './library';
import type { ToolSpec } from './github';

/**
 * US labour statistics, behind a door because the key rides in the body.
 *
 * The crew could already *read* `api.bls.gov` — the indicators tool has been
 * calling the v1 series endpoint through the web door since it was compiled,
 * because v1 is a plain GET and `fetch_page` is a plain GET. What v1 is not is
 * usable: it is keyless, and the keyless allowance is 25 requests a day against
 * a bucket the error names as belonging to `registration key ` — the empty one.
 * Two probes on 2026-08-15, forty-five minutes apart, with nothing local having
 * spent a single call, both came back `REQUEST_NOT_PROCESSED`. A daily budget
 * this project cannot see the consumption of is not a budget it can plan a
 * gate around.
 *
 * v2 fixes that — 500 requests a day, and up to 50 series in one call — but it
 * takes `registrationkey` in a **JSON POST body**, and the web door cannot
 * carry one: `/internal/fetch` is `fetchPage(url)`, deliberately generic and
 * deliberately GET. So this is the third key-bearing door, built exactly like
 * the code host and the search box: tool-shaped, the catalog's `tools` list as
 * the grant, the key read from the server's own environment and never handed
 * out. A compiled tool's environment has every declared secret stripped from
 * it (`secretNames`), so the door is not a convenience here — it is the only
 * route a tool has to a credential, by design.
 *
 * Builtin rather than stdio for D-040's reason, which BLS makes vivid: the raw
 * answer carries every observation of every requested year, with footnotes and
 * calculations per row. We own the call, so we own the size of the reply.
 */

/** Enough history for a year-on-year comparison without paying for a decade. */
const DEFAULT_YEARS = 2;
const MAX_YEARS = 11;
/** BLS's own ceiling on one registered call, and the reason a batch is worth it. */
const MAX_SERIES = 50;
const ENDPOINT = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';

export const BLS_TOOLS: ToolSpec[] = [
  {
    name: 'bls_series',
    description:
      'Fetch US Bureau of Labor Statistics time series by id (for example CUUR0000SA0 for CPI-U, LNS14000000 for unemployment, CES0000000001 for payrolls). Returns the monthly observations newest first. Ask for every series you need in one call.',
    params: [
      {
        name: 'seriesIds',
        type: 'string',
        required: true,
        describe: `series ids, comma-separated, up to ${MAX_SERIES}`,
      },
      {
        name: 'years',
        type: 'number',
        describe: `how many years back, 1-${MAX_YEARS} (default ${DEFAULT_YEARS})`,
      },
    ],
  },
];

export const BLS_TOOL_NAMES = BLS_TOOLS.map((t) => t.name);

export interface BlsObservation {
  year: number;
  /** 1–12. Annual and semi-annual rows are dropped before this point. */
  month: number;
  value: number;
  /** "July 2026", as BLS words it — kept so a report can quote the period. */
  label: string;
}

export interface BlsSeries {
  seriesId: string;
  observations: BlsObservation[];
}

export interface BlsResult {
  series?: BlsSeries[];
  /**
   * The same answer as prose, because this door has two callers who want
   * different things from it.
   *
   * A compiled tool reads `series` and does arithmetic on the numbers — asking
   * it to parse them back out of a formatted string would be absurd. A session
   * reads `text`, which is what the runner hands the model and the only field
   * the generic builtin loop knows about. Serving one and not the other leaves
   * whichever caller was forgotten holding `undefined`.
   */
  text?: string;
  error?: string;
}

/** The latest observations, small enough to read and enough to work from. */
const SHOWN = 3;

function render(series: BlsSeries[]): string {
  return series
    .map((s) => {
      const shown = s.observations.slice(0, SHOWN);
      const head = `${s.seriesId} — ${s.observations.length} monthly observations, newest first:`;
      const rows = shown.map((o) => `  ${o.label}: ${o.value}`);
      const rest =
        s.observations.length > shown.length
          ? [`  …and ${s.observations.length - shown.length} earlier, back to ${s.observations.at(-1)!.label}`]
          : [];
      return [head, ...rows, ...rest].join('\n');
    })
    .join('\n\n');
}

interface RawRow {
  year?: unknown;
  period?: unknown;
  periodName?: unknown;
  value?: unknown;
}

/**
 * Monthly rows only, newest first.
 *
 * `M13` is BLS's annual average and shares the shape of a month, so a caller
 * reading "the latest observation" without dropping it would compare a
 * year's average against a month and call it a change.
 */
function monthly(rows: RawRow[]): BlsObservation[] {
  const out: BlsObservation[] = [];
  for (const row of rows) {
    const period = typeof row.period === 'string' ? row.period : '';
    if (!/^M(0[1-9]|1[0-2])$/.test(period)) continue;
    const year = Number(row.year);
    const value = Number(row.value);
    if (!Number.isFinite(year) || !Number.isFinite(value)) continue;
    out.push({
      year,
      month: Number(period.slice(1)),
      value,
      label:
        typeof row.periodName === 'string' && row.periodName ? `${row.periodName} ${year}` : `${year}-${period}`,
    });
  }
  out.sort((a, b) => b.year - a.year || b.month - a.month);
  return out;
}

/**
 * One batched call. `http` is injected so tests need no network, exactly as the
 * code host and the search box do.
 */
export async function callBls(
  tool: string,
  args: Record<string, unknown>,
  options: { http: Http; token?: string; now?: number },
): Promise<BlsResult> {
  if (tool !== 'bls_series') return { error: `no such tool: ${tool}` };

  const asked = typeof args.seriesIds === 'string' ? args.seriesIds : '';
  const seriesIds = asked
    .split(',')
    .map((id) => id.trim().toUpperCase())
    .filter(Boolean)
    .filter((id, i, all) => all.indexOf(id) === i);
  if (seriesIds.length === 0) return { error: 'seriesIds is required' };
  if (seriesIds.length > MAX_SERIES) {
    return { error: `too many series — ${MAX_SERIES} at most in one call` };
  }

  // Required rather than optional, on the search box's precedent: without a key
  // this reaches v1's shared keyless bucket, which is the exhausted thing this
  // door exists to stop using. A configuration answer now beats a mystery
  // REQUEST_NOT_PROCESSED at run time.
  if (!options.token) {
    return {
      error:
        'no BLS_REGISTRATION_KEY is set, so the crew cannot read BLS — register free at https://data.bls.gov/registrationEngine and put the key in .env',
    };
  }

  const wanted = typeof args.years === 'number' ? Math.trunc(args.years) : DEFAULT_YEARS;
  const years = Math.max(1, Math.min(MAX_YEARS, wanted || DEFAULT_YEARS));
  const thisYear = new Date(options.now ?? Date.now()).getUTCFullYear();

  let res;
  try {
    res = await options.http(
      ENDPOINT,
      { 'content-type': 'application/json', accept: 'application/json' },
      {
        method: 'POST',
        body: JSON.stringify({
          seriesid: seriesIds,
          startyear: String(thisYear - (years - 1)),
          endyear: String(thisYear),
          registrationkey: options.token,
        }),
      },
    );
  } catch (err) {
    return { error: `could not reach BLS: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!res.ok) return { error: `BLS answered ${res.status}` };

  let payload: { status?: unknown; message?: unknown; Results?: { series?: unknown } };
  try {
    payload = JSON.parse(await res.text()) as typeof payload;
  } catch {
    return { error: 'BLS sent something unreadable' };
  }

  // BLS reports refusal in a 200 body, so the status field is the real result
  // code and ignoring it would read an empty answer as an answer.
  if (payload.status !== 'REQUEST_SUCCEEDED') {
    const said = Array.isArray(payload.message) ? payload.message.join(' ').trim() : '';
    const status = typeof payload.status === 'string' ? payload.status : 'an unreadable status';
    // The one a user can act on, named rather than passed through: the whole
    // point of registering is a budget that is ours rather than everyone's.
    if (/threshold/i.test(said)) {
      return { error: `the BLS daily quota is used up (${said})` };
    }
    return { error: said ? `BLS refused: ${status} — ${said}` : `BLS refused: ${status}` };
  }

  const raw = Array.isArray(payload.Results?.series) ? (payload.Results?.series as unknown[]) : [];
  const series: BlsSeries[] = [];
  for (const entry of raw) {
    const item = entry as { seriesID?: unknown; data?: unknown };
    const seriesId = typeof item.seriesID === 'string' ? item.seriesID : '';
    if (!seriesId) continue;
    series.push({
      seriesId,
      observations: monthly(Array.isArray(item.data) ? (item.data as RawRow[]) : []),
    });
  }
  if (series.length === 0) return { error: 'BLS returned no series' };

  /**
   * Named rather than silently short: asking for three ids and getting two
   * usable ones back is the shape that ships a table with a row quietly gone.
   *
   * **An unusable series is not an absent one, which is what a live call had
   * to teach.** A bad id comes back `REQUEST_SUCCEEDED`, echoed into
   * `Results.series` with an empty `data` array and the real answer — "Invalid
   * Series for Series NOTASERIES00" — sitting in `message`. So a check looking
   * for ids BLS *omitted* finds nothing wrong, because BLS omits nothing; the
   * first version of this passed its own test against a payload shape the
   * service never produces. Emptiness is the signal, and `message` is the
   * explanation, so both are read.
   *
   * Fails the whole call rather than returning the good rows, on the same rule
   * the indicators tool already follows: a partial answer that reads as a
   * complete one is worse than no answer.
   */
  const unusable = seriesIds.filter((id) => {
    const got = series.find((s) => s.seriesId === id);
    return !got || got.observations.length === 0;
  });
  if (unusable.length > 0) {
    const said = Array.isArray(payload.message)
      ? payload.message.filter((m) => typeof m === 'string').join('; ').trim()
      : '';
    return {
      error: `BLS returned no monthly observations for ${unusable.join(', ')}${said ? ` — ${said}` : ''}`,
    };
  }

  return { series, text: render(series) };
}
