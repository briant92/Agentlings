import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BUK_PAGE_SIZE,
  BUK_READS,
  BUK_REPLY_CEILING,
  bukBase,
  bukRead,
  bukRequest,
  bukToolSchema,
  callBukRead,
  refusalMessage,
  tenantProblem,
  trimReply,
} from './buk';

/**
 * The paths this adapter is allowed to hold, written out by hand rather than
 * derived from the table it is checking.
 *
 * Every one is a `GET` in Buk's own contract (`demo.buk.cl/api/chile/es/api_docs`,
 * Swagger 2.0, read 2026-08-26). The point of the duplication is that a table
 * edit which reached a write would have to be made twice, in two files, by
 * someone who read this comment — which is the only kind of guard a table can
 * have against itself.
 */
const CONTRACT_READS = [
  '/employees',
  '/employees/active',
  '/employees/{id}/plans',
  '/employees/{id}/vacations_available',
  '/employees/{id}/payroll_detail',
];

describe('the five reads', () => {
  it('is exactly the reads the ticket names, and nothing else', () => {
    expect(BUK_READS.map((r) => r.name)).toEqual([
      'employees',
      'active_employees',
      'employee_plans',
      'vacations_available',
      'pay_stubs',
    ]);
  });

  it('holds no path outside the contract reads', () => {
    expect(BUK_READS.map((r) => r.path).sort()).toEqual([...CONTRACT_READS].sort());
  });

  it('names the employee for every path that takes one', () => {
    for (const read of BUK_READS) {
      expect(read.path.includes('{id}')).toBe(Boolean(read.employeeParam));
    }
  });

  it('describes every query parameter it accepts', () => {
    for (const read of BUK_READS) {
      for (const param of read.query) expect(param.description.length).toBeGreaterThan(10);
    }
  });
});

describe('bukToolSchema', () => {
  it('requires the employee and nothing else', () => {
    const schema = bukToolSchema(bukRead('vacations_available')!);
    expect(schema.required).toEqual(['employee']);
    expect(Object.keys(schema.properties)).toEqual(['employee', 'discount', 'date']);
  });

  it('asks for no arguments at all where the read takes none', () => {
    const schema = bukToolSchema(bukRead('employee_plans')!);
    expect(schema.required).toEqual(['employee']);
    expect(Object.keys(schema.properties)).toEqual(['employee']);
  });

  it('offers an enum by its allowed values', () => {
    const schema = bukToolSchema(bukRead('employees')!);
    expect(schema.properties.status).toMatchObject({ enum: ['activo', 'inactivo', 'pendiente'] });
  });
});

describe('bukRequest', () => {
  const base = 'https://acme.buk.cl/api/v1/chile';

  it('refuses a tool it does not have, by name', () => {
    const result = bukRequest('create_employee', {}, base);
    expect(result).toEqual({ error: 'this connection has no tool called "create_employee" — it reads only' });
  });

  it('builds the plain list with no query at all', () => {
    expect(bukRequest('employees', {}, base)).toEqual({ url: `${base}/employees` });
  });

  it('puts the employee in the path, escaped', () => {
    expect(bukRequest('employee_plans', { employee: '12.345.678-9' }, base)).toEqual({
      url: `${base}/employees/12.345.678-9/plans`,
    });
    expect(bukRequest('employee_plans', { employee: 'a/b' }, base)).toEqual({
      url: `${base}/employees/a%2Fb/plans`,
    });
  });

  /**
   * The hole this check exists for, found in review and reproduced before it
   * was closed: `encodeURIComponent` leaves a dot unreserved, so an employee
   * of `..` produced `/employees/../payroll_detail`, which every URL parser —
   * `fetch` included — normalises to `/payroll_detail`. That is a path this
   * adapter does not hold, in the company-wide liquidaciones family it leaves
   * out by name. No write was ever reachable (only `GET` leaves, and a slash
   * is escaped, so it could walk one segment and never turn), but "five paths
   * and no sixth" was not true.
   */
  it('cannot be walked out of the five paths by a dotted employee', () => {
    for (const [tool, employee] of [
      ['pay_stubs', '..'],
      ['employee_plans', '.'],
      ['vacations_available', '..'],
    ] as const) {
      const result = bukRequest(tool, { employee }, base) as { error?: string; url?: string };
      expect(result.url, `${tool} accepted ${employee}`).toBeUndefined();
      expect(result.error).toContain('as an employee');
    }
    // It refuses precisely what a parser would rewrite, and nothing else.
    // Three dots is not a path segment with a meaning, so it stays an (absurd)
    // id and Buk is the one that says there is no such employee; a pre-encoded
    // `%2e%2e` is escaped again to a literal, so it never becomes a dot at all.
    expect(bukRequest('pay_stubs', { employee: '...' }, base)).toEqual({
      url: `${base}/employees/.../payroll_detail`,
    });
    expect(bukRequest('pay_stubs', { employee: '%2e%2e' }, base)).toEqual({
      url: `${base}/employees/%252e%252e/payroll_detail`,
    });
  });

  it('still reaches exactly the path the table names, parsed rather than concatenated', () => {
    for (const read of BUK_READS) {
      const args = read.employeeParam ? { employee: '12.345.678-9' } : {};
      const built = bukRequest(read.name, args, base) as { url: string };
      expect(new URL(built.url).pathname).toBe(
        `/api/v1/chile${read.path.replace('{id}', '12.345.678-9')}`,
      );
    }
  });

  it('refuses a missing employee by the name the tool uses', () => {
    expect(bukRequest('pay_stubs', {}, base)).toEqual({
      error: 'pay_stubs needs "employee" — the id or the RUT of the employee to read',
    });
  });

  it('refuses an argument it does not know, and says what it does know', () => {
    const result = bukRequest('employees', { salary: 100 }, base) as { error: string };
    expect(result.error).toContain('employees has no argument called "salary"');
    expect(result.error).toContain('status');
  });

  it('holds each date to the format that read actually wants', () => {
    // Two reads, two formats, both off Buk's own contract — the trap this
    // table exists to take off the caller.
    expect(bukRequest('active_employees', { date: '2026-08-26' }, base)).toEqual({
      url: `${base}/employees/active?date=2026-08-26`,
    });
    expect(bukRequest('vacations_available', { employee: '7', date: '26-08-2026' }, base)).toEqual({
      url: `${base}/employees/7/vacations_available?date=26-08-2026`,
    });
    expect(bukRequest('active_employees', { date: '26-08-2026' }, base)).toEqual({
      error: 'active_employees wants "date" as YYYY-MM-DD — "26-08-2026" is not',
    });
    expect(bukRequest('vacations_available', { employee: '7', date: '2026-08-26' }, base)).toEqual({
      error: 'vacations_available wants "date" as DD-MM-YYYY — "2026-08-26" is not',
    });
  });

  it('refuses a value outside an enum', () => {
    expect(bukRequest('employees', { status: 'active' }, base)).toEqual({
      error: 'employees wants "status" to be one of activo, inactivo, pendiente — not "active"',
    });
  });

  it('clamps the page size to the range Buk documents', () => {
    const { min, max } = BUK_PAGE_SIZE;
    expect(bukRequest('employees', { page_size: 1 }, base)).toEqual({ url: `${base}/employees?page_size=${min}` });
    expect(bukRequest('employees', { page_size: 5000 }, base)).toEqual({ url: `${base}/employees?page_size=${max}` });
    expect(bukRequest('employees', { page_size: 40 }, base)).toEqual({ url: `${base}/employees?page_size=40` });
    expect(min).toBe(25);
    expect(max).toBe(100);
  });

  it('refuses a page that is not a whole number', () => {
    expect(bukRequest('employees', { page: 'two' }, base)).toEqual({
      error: 'employees wants "page" as a whole number — "two" is not',
    });
  });

  it('sends a boolean as Buk reads one', () => {
    expect(bukRequest('vacations_available', { employee: '7', discount: true }, base)).toEqual({
      url: `${base}/employees/7/vacations_available?discount=true`,
    });
    expect(bukRequest('active_employees', { exclude_pending: false }, base)).toEqual({
      url: `${base}/employees/active?exclude_pending=false`,
    });
  });

  it('leaves out an argument that was not given', () => {
    expect(bukRequest('employees', { status: 'activo', page: undefined }, base)).toEqual({
      url: `${base}/employees?status=activo`,
    });
  });
});

describe('bukBase and tenantProblem', () => {
  it('builds the tenant address Buk documents', () => {
    expect(bukBase('acme')).toBe('https://acme.buk.cl/api/v1/chile');
  });

  it('refuses anything that is not a bare subdomain', () => {
    expect(tenantProblem('acme')).toBeNull();
    expect(tenantProblem('acme-rrhh')).toBeNull();
    expect(tenantProblem('')).toMatch(/--tenant/);
    // A whole URL, a path or a host would each build an address somewhere
    // other than the tenant, which is the one thing a read must not do.
    expect(tenantProblem('https://acme.buk.cl')).toMatch(/subdomain/);
    expect(tenantProblem('acme.buk.cl')).toMatch(/subdomain/);
    expect(tenantProblem('acme/../evil')).toMatch(/subdomain/);
  });
});

describe('refusalMessage', () => {
  it('reads Buk’s real 401 body as a sentence about the key', () => {
    // Measured against the real API on 2026-08-26: no token and a wrong token
    // both answer 401 with the body `"no_authorize"`.
    const message = refusalMessage(401, '"no_authorize"');
    expect(message).toContain('401');
    expect(message).toContain('BUK_API_KEY');
    expect(message).toContain('no_authorize');
  });

  it('sends a 403 to the token’s permissions rather than to its value', () => {
    expect(refusalMessage(403, '')).toMatch(/permission/i);
  });

  it('reads a 404 as the employee, since every path here is fixed', () => {
    expect(refusalMessage(404, '')).toMatch(/no employee/i);
  });

  it('keeps an unexpected status readable and keeps its body', () => {
    expect(refusalMessage(500, 'boom')).toContain('500');
    expect(refusalMessage(500, 'boom')).toContain('boom');
  });

  it('never echoes more of a body than a person would read', () => {
    expect(refusalMessage(500, 'x'.repeat(5000)).length).toBeLessThan(1000);
  });
});

describe('trimReply', () => {
  const record = (n: number) => ({ id: n, filler: 'x'.repeat(500) });

  it('passes a small reply through byte for byte', () => {
    const body = { data: [record(1)], pagination: { page: 1 } };
    expect(trimReply(body)).toBe(JSON.stringify(body, null, 2));
  });

  it('drops whole records rather than cutting the text, and says how many it kept', () => {
    const body = { data: Array.from({ length: 400 }, (_, i) => record(i)), pagination: { page: 1 } };
    const text = trimReply(body);
    expect(text.length).toBeLessThanOrEqual(BUK_REPLY_CEILING);
    const parsed = JSON.parse(text) as { data: unknown[]; trimmed?: string };
    // Still JSON, still the same envelope, and the loss is stated rather
    // than left for the reader to notice.
    expect(parsed.data.length).toBeGreaterThan(0);
    expect(parsed.data.length).toBeLessThan(400);
    expect(parsed.trimmed).toContain('400');
    expect(parsed.trimmed).toContain('page_size');
  });

  it('leaves a reply with no record array alone even when it is long', () => {
    const body = { note: 'y'.repeat(BUK_REPLY_CEILING * 2) };
    expect(trimReply(body)).toBe(JSON.stringify(body, null, 2));
  });
});

/**
 * The adapter against a Buk that records what it was asked.
 *
 * This is the check the ticket's sharpest claim rests on: *a modify-scoped key
 * still cannot reach a write*. It cannot be proven by reading the table — a
 * table says what it holds, not what the process does — so every tool is
 * driven through the real request path and the server writes down the method
 * and the body it received.
 */
describe('against a Buk that writes down what it was asked', () => {
  const seen: { method: string; url: string; token?: string; accept?: string; body: string }[] = [];
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        seen.push({
          method: req.method ?? '',
          url: req.url ?? '',
          token: req.headers['auth_token'] as string | undefined,
          accept: req.headers.accept,
          body,
        });
        if (req.url?.includes('/employees/404/')) {
          res.writeHead(404, { 'content-type': 'application/json' });
          res.end('"not_found"');
          return;
        }
        if (req.url?.includes('/employees/302/')) {
          // Deliberately somewhere that WOULD answer 200 if it were followed —
          // an unreachable target would make the assertion below pass whether
          // redirects are followed or not.
          res.writeHead(302, { location: '/api/v1/chile/employees' });
          res.end();
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 1 }], pagination: { page: 1 } }));
      });
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const port = (server.address() as { port: number }).port;
    base = `http://127.0.0.1:${port}/api/v1/chile`;
  });

  afterAll(() => new Promise<void>((done) => server.close(() => done())));

  it('asks for every one of its tools with GET and no body', async () => {
    seen.length = 0;
    for (const read of BUK_READS) {
      const args = read.employeeParam ? { employee: '7' } : {};
      const result = await callBukRead(read.name, args, { base, token: 'a-token' });
      expect(result.ok, `${read.name}: ${result.text}`).toBe(true);
    }
    expect(seen).toHaveLength(BUK_READS.length);
    for (const request of seen) {
      expect(request.method).toBe('GET');
      expect(request.body).toBe('');
      expect(request.token).toBe('a-token');
      expect(request.accept).toBe('application/json');
    }
  });

  it('reaches the paths the contract names', async () => {
    seen.length = 0;
    await callBukRead('active_employees', { date: '2026-08-26' }, { base, token: 't' });
    await callBukRead('pay_stubs', { employee: '9', period_type: 'monthly' }, { base, token: 't' });
    expect(seen.map((r) => r.url)).toEqual([
      '/api/v1/chile/employees/active?date=2026-08-26',
      '/api/v1/chile/employees/9/payroll_detail?period_type=monthly',
    ]);
  });

  it('turns a refusal into a sentence and never claims it worked', async () => {
    const result = await callBukRead('employee_plans', { employee: '404' }, { base, token: 't' });
    expect(result.ok).toBe(false);
    expect(result.text).toMatch(/no employee/i);
  });

  /**
   * `auth_token` is a header of Buk's own invention, and only `Authorization`
   * is stripped when a redirect crosses to another origin — so following one
   * would hand a live payroll token to whatever answered.
   */
  it('refuses a redirect rather than carrying the token to wherever it points', async () => {
    seen.length = 0;
    const result = await callBukRead('employee_plans', { employee: '302' }, { base, token: 't' });
    expect(result.ok).toBe(false);
    expect(result.text).toMatch(/could not be reached/i);
    // One request, not two: the redirect was refused, not walked.
    expect(seen).toHaveLength(1);
  });

  it('refuses a bad argument before it reaches the wire at all', async () => {
    seen.length = 0;
    const result = await callBukRead('employees', { status: 'active' }, { base, token: 't' });
    expect(result.ok).toBe(false);
    expect(seen).toHaveLength(0);
  });

  it('says so when Buk cannot be reached, rather than throwing', async () => {
    const result = await callBukRead(
      'employees',
      {},
      { base: 'http://127.0.0.1:1/api/v1/chile', token: 't' },
    );
    expect(result.ok).toBe(false);
    expect(result.text).toMatch(/could not be reached/i);
  });
});

describe('bukRead', () => {
  it('is the one place a tool name becomes a request, and refuses the rest', () => {
    expect(bukRead('employees')?.path).toBe('/employees');
    expect(bukRead('employees_create')).toBeUndefined();
  });
});
