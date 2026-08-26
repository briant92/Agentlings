/**
 * Buk, read-only (#18, D-252).
 *
 * Buk is the Chilean HR and payroll system a company runs its people on. It
 * publishes a **per-tenant REST API** with a static token and **no MCP
 * server**, so a door to it is not a catalog line — something has to speak
 * MCP on one side and Buk's REST on the other. This module is that
 * something's whole mind; `scripts/buk-mcp.mts` is only the mouth.
 *
 * **Read-only, whatever the key's scope.** Buk issues a token as *Lectura* or
 * *Lectura y Modificación*, and an admin who hands over the wrong one is a
 * likely event, not a hypothetical. So the guarantee is not "we asked for a
 * read key": there is **one request function**, it hard-codes `GET`, it never
 * takes a body, and the only paths it can build come from the table below —
 * five, each a `GET` in Buk's own contract. A write is not refused here; it is
 * unrepresentable. `buk.test.ts` proves it by driving every tool through the
 * real request path at a server that writes down the method it received,
 * because a table can only say what it holds, not what the process does.
 *
 * **Where the table came from.** Buk serves an unauthenticated Swagger 2.0
 * contract from every tenant — `https://demo.buk.cl/api/chile/es/api_docs`,
 * 151 paths, read 2026-08-26 — and every path, parameter and date format
 * below is off it rather than off prose. The two date formats are the reason
 * the parameters are a table at all: `vacations_available` wants DD-MM-YYYY
 * and `employees/active` wants YYYY-MM-DD, in the same API, and a caller who
 * guesses gets a silent wrong answer rather than an error.
 *
 * **Not exposed, by name.** `GET /payroll_detail/month` lists every
 * employee's liquidación for a month and Buk gates it behind *Permitir ver
 * información sensible*. The ticket's pay-stub read is one employee's, which
 * is what a payroll question actually asks, so the company-wide one stays
 * out — D-249's sensitive line, and a door is added when something needs it,
 * never in case.
 */

import { clip, trimToCeiling } from './doorreply';

/** Buk is per country in its own path; this adapter is the Chilean one. */
export const BUK_COUNTRY = 'chile';

/**
 * The most JSON one read may answer with.
 *
 * The builtin doors trim prose to 12,000 characters (`catalog/connections.json`),
 * but a Buk reply is records rather than prose and a truncated record is a
 * lie, so the unit here is the record and the ceiling is higher. It is still a
 * ceiling: a hundred employee records is a context, not an answer, and this
 * adapter is ours, so unlike a third-party stdio server it owns the size of
 * what it says.
 */
export const BUK_REPLY_CEILING = 40_000;

/** Buk's own documented range for `page_size`, and its own default. */
export const BUK_PAGE_SIZE = { min: 25, max: 100 } as const;

/** How long to wait for Buk before saying it did not answer. */
const BUK_TIMEOUT_MS = 30_000;

export type BukParamKind = 'text' | 'whole' | 'page-size' | 'boolean' | 'enum' | 'date-ymd' | 'date-dmy';

export interface BukParam {
  name: string;
  kind: BukParamKind;
  /** `enum` only — the values Buk accepts, in Buk's own spelling. */
  values?: string[];
  description: string;
}

export interface BukRead {
  /** The tool name a session calls, after the `mcp__buk__` prefix. */
  name: string;
  /** What the tool does, as the model reads it. */
  summary: string;
  /** The path under the tenant's `/api/v1/chile`, with `{id}` where one goes. */
  path: string;
  /** Present exactly when the path has an `{id}`; the tool calls it `employee`. */
  employeeParam?: { description: string };
  query: BukParam[];
}

/** The one argument name every per-employee read uses. */
const EMPLOYEE = 'employee';

const PAGE_SIZE: BukParam = {
  name: 'page_size',
  kind: 'page-size',
  description: `how many records per page, ${BUK_PAGE_SIZE.min}–${BUK_PAGE_SIZE.max}; Buk's default is ${BUK_PAGE_SIZE.min}`,
};

/**
 * The five reads, and there is no sixth.
 *
 * Buk's contract offers 151 paths. What is here is what #18 names, with the
 * filters a payroll question actually asks — the rest of `GET /employees`'s
 * thirteen query parameters are absent until something needs one, because an
 * argument the model can see is an argument it can spend a turn getting wrong.
 */
export const BUK_READS: BukRead[] = [
  {
    name: 'employees',
    summary:
      'List employees on the Buk payroll, newest page first. Filter by status, document number or work email. Reads only.',
    path: '/employees',
    query: [
      {
        name: 'status',
        kind: 'enum',
        values: ['activo', 'inactivo', 'pendiente'],
        description: "the employee's status, in Buk's own Spanish spelling",
      },
      {
        name: 'document_number',
        kind: 'text',
        description: 'the RUT or document number, with no dots and no dash',
      },
      { name: 'email', kind: 'text', description: "the employee's work email address" },
      { name: 'page', kind: 'whole', description: 'which page of results to read, counting from 1' },
      PAGE_SIZE,
    ],
  },
  {
    name: 'active_employees',
    summary:
      'List the employees who hold an active plan and job on a given date — Buk’s own definition of “vigente”. Defaults to today in the open month. Reads only.',
    path: '/employees/active',
    query: [
      { name: 'rut', kind: 'text', description: 'a single RUT, to ask about one employee' },
      {
        name: 'date',
        kind: 'date-ymd',
        description: 'the date on which the contract must be active, as YYYY-MM-DD',
      },
      {
        name: 'exclude_pending',
        kind: 'boolean',
        description: 'true to leave out employees whose start is still pending',
      },
      PAGE_SIZE,
    ],
  },
  {
    name: 'employee_plans',
    summary: 'Read one employee’s pension and health plans (AFP and previsión de salud). Reads only.',
    path: '/employees/{id}/plans',
    employeeParam: { description: 'the id of the employee to read' },
    query: [],
  },
  {
    name: 'vacations_available',
    summary:
      'Read how many vacation days one employee has available. Reads only — it cannot request, approve or book leave.',
    path: '/employees/{id}/vacations_available',
    employeeParam: {
      description: 'the id, or the document number with no dots and no dash, of the employee to read',
    },
    query: [
      {
        name: 'discount',
        kind: 'boolean',
        description: 'true to subtract leave already booked in the future, giving the projected balance',
      },
      {
        name: 'date',
        kind: 'date-dmy',
        // Buk's own contract, and not a typo: this read wants the day first
        // while `active_employees` wants the year first.
        description: 'the date the balance is calculated at, as DD-MM-YYYY; defaults to the end of the open month',
      },
    ],
  },
  {
    name: 'pay_stubs',
    summary:
      'Read one employee’s pay stubs (liquidaciones) — the current period, or every period inside a date range. Reads only.',
    path: '/employees/{id}/payroll_detail',
    employeeParam: { description: 'the id or the RUT of the employee to read' },
    query: [
      {
        name: 'period_type',
        kind: 'enum',
        values: ['monthly', 'semi_monthly', 'weekly'],
        description: 'how long a pay period is; monthly unless the company says otherwise',
      },
      { name: 'start', kind: 'date-dmy', description: 'the first period to read, as DD-MM-YYYY' },
      { name: 'end', kind: 'date-dmy', description: 'the last period to read, as DD-MM-YYYY' },
      PAGE_SIZE,
    ],
  },
];

/** The read a tool name means, or nothing — the only way a name becomes a path. */
export function bukRead(name: string): BukRead | undefined {
  return BUK_READS.find((read) => read.name === name);
}

/** The tenant's API root, the one address this adapter ever builds. */
export function bukBase(tenant: string): string {
  return `https://${tenant}.buk.cl/api/v1/${BUK_COUNTRY}`;
}

/**
 * What is wrong with a tenant, or null.
 *
 * A bare subdomain and nothing else: the tenant is the only part of the
 * address that comes from outside this file, so anything that could carry a
 * host, a scheme or a path segment would let configuration decide where a
 * read with a live payroll token goes.
 */
export function tenantProblem(tenant: string): string | null {
  if (!tenant.trim()) return 'no tenant — pass --tenant <subdomain>, the part before .buk.cl in your Buk address';
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(tenant)) {
    return `"${tenant}" is not a Buk subdomain — pass only the part before .buk.cl, in lower case`;
  }
  return null;
}

/** The MCP input schema for one read, built from its own parameters. */
export function bukToolSchema(read: BukRead): {
  type: 'object';
  properties: Record<string, Record<string, unknown>>;
  required: string[];
  additionalProperties: false;
} {
  const properties: Record<string, Record<string, unknown>> = {};
  if (read.employeeParam) {
    properties[EMPLOYEE] = { type: 'string', description: read.employeeParam.description };
  }
  for (const param of read.query) properties[param.name] = schemaFor(param);
  return {
    type: 'object',
    properties,
    required: read.employeeParam ? [EMPLOYEE] : [],
    additionalProperties: false,
  };
}

function schemaFor(param: BukParam): Record<string, unknown> {
  const base = { description: param.description };
  switch (param.kind) {
    case 'boolean':
      return { ...base, type: 'boolean' };
    case 'whole':
      return { ...base, type: 'integer', minimum: 1 };
    case 'page-size':
      return { ...base, type: 'integer', minimum: BUK_PAGE_SIZE.min, maximum: BUK_PAGE_SIZE.max };
    case 'enum':
      return { ...base, type: 'string', enum: param.values };
    default:
      return { ...base, type: 'string' };
  }
}

/**
 * The address a tool call means, or what is wrong with it — the one place a
 * tool name and some arguments become something to fetch.
 *
 * Every refusal names the tool, the argument and what was wanted, because the
 * reader is a model that will otherwise retry the same shape: "not valid" costs
 * a turn, "wants DD-MM-YYYY" costs none.
 */
export function bukRequest(
  toolName: string,
  args: Record<string, unknown>,
  base: string,
): { url: string } | { error: string } {
  const read = bukRead(toolName);
  if (!read) return { error: `this connection has no tool called "${toolName}" — it reads only` };

  const known = new Set(read.query.map((p) => p.name));
  if (read.employeeParam) known.add(EMPLOYEE);
  for (const [name, value] of Object.entries(args)) {
    if (value === undefined || value === null) continue;
    if (!known.has(name)) {
      const takes = [...known].join(', ');
      return { error: `${read.name} has no argument called "${name}" — it takes ${takes || 'no arguments'}` };
    }
  }

  let path = read.path;
  if (read.employeeParam) {
    const employee = args[EMPLOYEE];
    if (employee === undefined || employee === null || `${employee}`.trim() === '') {
      return { error: `${read.name} needs "${EMPLOYEE}" — ${read.employeeParam.description}` };
    }
    path = path.replace('{id}', encodeURIComponent(`${employee}`.trim()));
  }

  const query = new URLSearchParams();
  for (const param of read.query) {
    const raw = args[param.name];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = valueFor(read.name, param, raw);
    if ('error' in value) return value;
    query.set(param.name, value.value);
  }

  const search = query.toString();
  const url = `${base}${path}${search ? `?${search}` : ''}`;

  // The claim at the top of this file — five paths, and no sixth — is *checked*
  // here rather than assumed, because until now it was not true. A URL is a
  // string until something parses it, and every parser normalises `.` and `..`
  // away; `encodeURIComponent` leaves a dot unreserved, so an employee of `..`
  // built `/employees/../payroll_detail` and `fetch` sent it as
  // `/payroll_detail` — the company-wide liquidaciones family this adapter
  // leaves out by name. Comparing the parsed path against the literal one
  // catches that and anything else a parser decides to do to a path we built
  // by concatenation.
  if (new URL(url).pathname !== `${new URL(base).pathname}${path}`) {
    return {
      error: `${read.name} cannot read "${args[EMPLOYEE]}" as an employee — an id or a RUT, and nothing that is a path`,
    };
  }
  return { url };
}

function valueFor(
  toolName: string,
  param: BukParam,
  raw: unknown,
): { value: string } | { error: string } {
  const text = `${raw}`;
  switch (param.kind) {
    case 'boolean':
      if (typeof raw === 'boolean') return { value: raw ? 'true' : 'false' };
      if (text === 'true' || text === 'false') return { value: text };
      return { error: `${toolName} wants "${param.name}" as true or false — "${text}" is not` };
    case 'whole':
      if (!/^\d+$/.test(text)) {
        return { error: `${toolName} wants "${param.name}" as a whole number — "${text}" is not` };
      }
      return { value: text };
    case 'page-size': {
      if (!/^\d+$/.test(text)) {
        return { error: `${toolName} wants "${param.name}" as a whole number — "${text}" is not` };
      }
      // Clamped rather than refused: Buk answers 25–100 and a caller asking
      // for 500 wants "as many as you can", which is 100.
      const clamped = Math.min(BUK_PAGE_SIZE.max, Math.max(BUK_PAGE_SIZE.min, Number(text)));
      return { value: `${clamped}` };
    }
    case 'enum':
      if (!param.values?.includes(text)) {
        return {
          error: `${toolName} wants "${param.name}" to be one of ${(param.values ?? []).join(', ')} — not "${text}"`,
        };
      }
      return { value: text };
    case 'date-ymd':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return { error: `${toolName} wants "${param.name}" as YYYY-MM-DD — "${text}" is not` };
      }
      return { value: text };
    case 'date-dmy':
      if (!/^\d{2}-\d{2}-\d{4}$/.test(text)) {
        return { error: `${toolName} wants "${param.name}" as DD-MM-YYYY — "${text}" is not` };
      }
      return { value: text };
    default:
      return { value: text };
  }
}

/** As much of Buk's own words as a person would read, and no more. */

/**
 * A Buk refusal as a sentence.
 *
 * Buk answers a wrong or missing token with `401` and the body `"no_authorize"`
 * — measured against the real API on 2026-08-26 — which tells the reader
 * nothing about what to do. Each status is sent at the thing the reader can
 * actually change, and Buk's own words are kept beside it rather than replaced
 * by ours.
 */
export function refusalMessage(status: number, body: string): string {
  const said = clip(body);
  const tail = said ? ` Buk said: ${said}` : '';
  switch (status) {
    case 401:
      return `Buk refused the key (401) — BUK_API_KEY is not a token this tenant accepts.${tail}`;
    case 403:
      return `Buk accepted the key but refused the read (403) — the token lacks read permission on this module.${tail}`;
    case 404:
      return `Buk has no employee by that id or RUT (404) — every path this connection uses is fixed, so the id is what is wrong.${tail}`;
    case 400:
      return `Buk refused the arguments (400).${tail}`;
    case 429:
      return `Buk is rate-limiting this token (429) — wait and ask again.${tail}`;
    default:
      return `Buk answered ${status}.${tail}`;
  }
}

/**
 * A Buk reply as text, under the ceiling.
 *
 * Records are dropped whole and the loss is *stated*: a reply cut mid-record
 * is invalid JSON, and a reply quietly shortened is the worst of both — the
 * reader believes it has the set. `data` is Buk's own envelope key, beside
 * `pagination`.
 *
 * The mechanism moved to `doorreply.ts` when the SII door (D-267) needed the
 * same one — D-030's rule, taken at the second copy rather than the third.
 * What stays here is what is Buk's: its key, its ceiling and its words.
 */
export function trimReply(body: unknown): string {
  return trimToCeiling(body, {
    ceiling: BUK_REPLY_CEILING,
    path: ['data'],
    note: (kept, total) =>
      `kept ${kept} of ${total} records — the reply passed this connection's ${BUK_REPLY_CEILING}-character ceiling; ask again with a smaller page_size or a filter`,
    // No `untrimmable`: a reply with no `data` list goes back exactly as it
    // came, which is what this door has always done (#18) and what its test
    // asserts by value. The extraction changes no behaviour here.
  });
}

export interface BukConfig {
  /** The tenant's API root, from `bukBase`. */
  base: string;
  token: string;
}

/**
 * One read, asked of Buk.
 *
 * **The only place this adapter touches the network**, and it is a `GET` with
 * no body — there is no parameter that could make it anything else. Failure is
 * a readable sentence rather than a throw, because the caller is a model and a
 * stack trace is a wasted turn.
 */
export async function callBukRead(
  toolName: string,
  args: Record<string, unknown>,
  config: BukConfig,
): Promise<{ ok: boolean; text: string }> {
  const built = bukRequest(toolName, args, config.base);
  if ('error' in built) return { ok: false, text: built.error };

  let response: Response;
  try {
    response = await fetch(built.url, {
      method: 'GET',
      headers: { auth_token: config.token, Accept: 'application/json' },
      // A redirect is not followed, it is an error. `auth_token` is a header
      // of Buk's own invention, and only `Authorization` is stripped when a
      // redirect crosses to another origin — so a followed redirect would
      // hand a live payroll token to whatever answered. Buk's API does not
      // redirect; if it starts, that is worth finding out about rather than
      // obeying.
      redirect: 'error',
      signal: AbortSignal.timeout(BUK_TIMEOUT_MS),
    });
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return { ok: false, text: `Buk at ${hostOf(config.base)} could not be reached — ${why}` };
  }

  const body = await response.text().catch(() => '');
  if (!response.ok) return { ok: false, text: refusalMessage(response.status, body) };

  try {
    return { ok: true, text: trimReply(JSON.parse(body)) };
  } catch {
    // A 200 that is not JSON is Buk answering with something we do not model —
    // hand it over as it came rather than pretending to have parsed it.
    return { ok: true, text: clip(body) };
  }
}

function hostOf(base: string): string {
  try {
    return new URL(base).host;
  } catch {
    return base;
  }
}
