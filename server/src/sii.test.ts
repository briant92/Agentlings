import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { THROWAWAY_CERT_PASSWORD, makeThrowawayCertificate } from './siicert.fixture';
import * as emisso from '@emisso/sii';
import { createSiiHttpClient, type PortalSession } from '@emisso/sii';
import {
  SII_CERT_LOGIN,
  SII_DOCUMENT_TYPES,
  SII_LOGOUT,
  SII_READS,
  SII_REJECTED,
  SII_REPLY_CEILING,
  SII_STATES,
  certProblem,
  loginOutcome,
  reachProblem,
  refusalMessage,
  rutProblem,
  siiDoor,
  siiQuery,
  siiRead,
  siiToolSchema,
  trimReply,
  type SiiLogin,
} from './sii';

/**
 * The addresses this door is allowed to hold, written out by hand rather than
 * derived from the table it is checking.
 *
 * The point of the duplication is that a table edit which reached a write
 * would have to be made twice, in two files, by someone who read this comment
 * — which is the only kind of guard a table can have against itself. Unlike
 * D-266's Buk these came off no published contract: they were read out of the
 * SII portal's own single-page-app bundle, they are versioned by nobody, and
 * that fragility is the ticket's own line.
 */
const FACADE_READS = [
  '/consdcvinternetui/services/data/facadeService/getResumen',
  '/consdcvinternetui/services/data/facadeService/getDetalleCompra',
  '/consdcvinternetui/services/data/facadeService/getDetalleVenta',
];

/**
 * What opening a session costs, in addresses.
 *
 * Every one of these is a `GET` or an empty `POST` that only says "I am here";
 * they are listed so that the wire test below can assert the *whole* set of
 * addresses a read touches, rather than only the one it meant to.
 */
const SESSION_SETUP = [
  '/consdcvinternetui/',
  '/common-1.0/services/autConfDataService/obtieneConf',
  '/common-1.0/services/aaSessionService/load',
  '/cgi_AUT2000/AutTknData.cgi',
  '/consdcvinternetui/services/data/settingsService/consultarParametros',
  '/consdcvinternetui/services/data/facadeService/getDatosInicio',
];

/** Every name in `@emisso/sii` that would write to the SII if it worked. */
const WRITES = [
  'uploadDte',
  'requestFolios',
  'sendAcuseRecibo',
  'sendReciboMercaderias',
  'sendResultadoDte',
  'signDte',
  'buildDteXml',
  'applyTimbre',
];

/** A real RUT, check digit and all, for everything below. */
const RUT = '76123456-0';

// ── the certificate, made here so the refusals are measured rather than guessed ──

let certPath = '';
const CERT_PASSWORD = THROWAWAY_CERT_PASSWORD;

beforeAll(() => {
  certPath = makeThrowawayCertificate();
}, 60_000);

// ── the table ────────────────────────────────────────────────────────────────

describe('the three reads', () => {
  it('is exactly the reads the ticket names, and nothing else', () => {
    expect(SII_READS.map((read) => read.name)).toEqual([
      'register_summary',
      'received_documents',
      'issued_documents',
    ]);
  });

  it('holds no address outside the facade reads', () => {
    expect(SII_READS.map((read) => read.endpoint).sort()).toEqual([...FACADE_READS].sort());
  });

  it('names no accept, claim or issue operation', () => {
    for (const read of SII_READS) {
      expect(read.name).not.toMatch(/accept|claim|reclam|acuse|send|upload|issue_|create|delete/i);
      expect(read.summary).toMatch(/reads only/i);
    }
  });

  it('fixes the side on the detail reads and asks for it on the summary', () => {
    expect(siiRead('received_documents')!.side).toBe('received');
    expect(siiRead('issued_documents')!.side).toBe('issued');
    expect(siiRead('register_summary')!.side).toBeUndefined();
  });
});

/**
 * The dependency, held to what it actually is.
 *
 * Measured 2026-08-26: every write `@emisso/sii@0.1.1` exports is a
 * `throw new Error("Not implemented")` stub, so the package cannot write to
 * SII today whatever anyone imports. That is *why* this test exists rather
 * than a reason to relax — the version that implements one arrives here as a
 * failing test, and someone re-reads this door before it ships.
 */
describe('the client this door is built on', () => {
  it('still cannot write to the SII at all', async () => {
    for (const name of WRITES) {
      const fn = (emisso as unknown as Record<string, unknown>)[name];
      expect(typeof fn, `${name} is not exported any more`).toBe('function');
      await expect(
        (fn as (...args: unknown[]) => Promise<unknown>)(),
        `${name} no longer throws — this door must be re-read before the bump ships`,
      ).rejects.toThrow(/not implemented/i);
    }
  });

  it('exports the accept and claim names this door leaves out, so leaving them out is a choice', () => {
    for (const name of ['sendAcuseRecibo', 'sendResultadoDte', 'sendReciboMercaderias']) {
      expect(Object.keys(emisso)).toContain(name);
    }
  });
});

// ── the RUT ──────────────────────────────────────────────────────────────────

describe('rutProblem', () => {
  it('takes a RUT in either spelling', () => {
    expect(rutProblem(RUT)).toBeNull();
    expect(rutProblem('76.123.456-0')).toBeNull();
    expect(rutProblem('5126663-3')).toBeNull();
  });

  it('says what a missing RUT is', () => {
    expect(rutProblem('')).toContain('--rut');
  });

  /**
   * The trap this check exists for, measured 2026-08-26: the package's own
   * `validateRut` answers `true` for a RUT with no dash, and its own `splitRut`
   * then throws on the same string. Refused here, before anything downstream is
   * handed a shape it cannot take.
   */
  it('refuses a RUT with no dash, which the package itself calls valid', () => {
    expect(emisso.validateRut('761234560')).toBe(true);
    expect(() => emisso.splitRut('761234560')).toThrow();
    expect(rutProblem('761234560')).toContain('after a dash');
  });

  it('refuses a RUT whose check digit does not match', () => {
    expect(rutProblem('76123456-7')).toContain('check digit');
  });

  it('refuses something that is not a RUT at all', () => {
    expect(rutProblem('acme')).toContain('is not a RUT');
    expect(rutProblem('https://www.sii.cl')).toContain('is not a RUT');
  });
});

// ── the certificate ──────────────────────────────────────────────────────────

describe('certProblem', () => {
  it('opens a real certificate with its real password', () => {
    expect(certProblem(certPath, CERT_PASSWORD)).toBeNull();
  });

  it('names the wrong password as the password, not as a certificate problem', () => {
    const problem = certProblem(certPath, 'not-the-password');
    expect(problem).toContain('SII_CERT_PASSWORD');
    expect(problem).toContain('that is not its password');
  });

  it('names a path that has no certificate at it', () => {
    expect(certProblem(`${certPath}.missing`, CERT_PASSWORD)).toContain('there is no certificate at');
  });

  it('names a file that is not a certificate', () => {
    const notACert = path.join(path.dirname(certPath), 'notes.txt');
    writeFileSync(notACert, 'this is not a PKCS#12 file');
    expect(certProblem(notACert, CERT_PASSWORD)).toContain('is not a certificate this can open');
  });

  it('refuses to go on with nothing configured, naming each by its own variable', () => {
    expect(certProblem('', CERT_PASSWORD)).toContain('SII_CERT_PATH');
    expect(certProblem(certPath, '')).toContain('SII_CERT_PASSWORD');
  });

  it('never hands back anything from inside the certificate', () => {
    // The whole return type is a sentence or nothing: there is no shape here
    // that could carry a private key to a caller.
    expect(certProblem(certPath, CERT_PASSWORD)).toBeNull();
  });
});

// ── the login, as a reading of SII's answer ──────────────────────────────────

describe('loginOutcome', () => {
  it('reads the measured rejection as the certificate, not as a network fault', () => {
    // Measured against the live SII on 2026-08-26: a POST to the certificate
    // login with no client certificate answers exactly this.
    const outcome = loginOutcome(302, `http://homer.sii.cl/${SII_REJECTED}?https://www.sii.cl`);
    expect(outcome).toHaveProperty('error');
    expect((outcome as { error: string }).error).toContain('would not take the certificate');
  });

  it('sends an accepted login on to where SII said', () => {
    expect(loginOutcome(302, 'https://misii.sii.cl/cgi_misii/siihome.cgi')).toEqual({
      next: 'https://misii.sii.cl/cgi_misii/siihome.cgi',
    });
    expect(loginOutcome(303, 'https://misii.sii.cl/x')).toEqual({ next: 'https://misii.sii.cl/x' });
  });

  /**
   * Found in review, on both axes at once: the login POST refuses redirects,
   * but the very next thing the door did was fetch whatever `Location` named.
   * The cookie jar scopes the session to sii.cl so nothing would have leaked,
   * but a process fetching an address a redirect chose is not something to
   * leave to a header — D-266's `redirect: 'error'` is the same discipline one
   * step earlier.
   */
  it('refuses to be sent on to a host that is not the SII', () => {
    for (const away of [
      'https://evil.example.com/collect',
      'https://sii.cl.evil.example.com/',
      'http://169.254.169.254/latest/meta-data/',
      'https://notsii.cl/',
    ]) {
      const outcome = loginOutcome(302, away) as { error?: string; next?: string };
      expect(outcome.next, `followed ${away}`).toBeUndefined();
      expect(outcome.error).toContain('not an SII address');
    }
  });

  it('follows SII’s own hosts, including one it has not met before', () => {
    for (const home of [
      'https://misii.sii.cl/cgi_misii/siihome.cgi',
      'https://www4.sii.cl/consdcvinternetui/',
      'https://sii.cl/',
      'https://something-new.sii.cl/x?y=z',
    ]) {
      expect(loginOutcome(302, home)).toEqual({ next: home });
    }
  });

  it('refuses a redirect that is not a web address at all', () => {
    expect((loginOutcome(302, 'file:///C:/Windows/win.ini') as { error: string }).error).toContain(
      'not a web address',
    );
    expect((loginOutcome(302, 'not a url') as { error: string }).error).toContain('not an address this can read');
  });

  it('says the login page may have changed when SII answers something else', () => {
    expect((loginOutcome(200, undefined) as { error: string }).error).toContain('may have changed');
    expect((loginOutcome(302, undefined) as { error: string }).error).toContain('to nowhere');
  });

  it('sends a portal that is unwell at the clock rather than at the certificate', () => {
    const outcome = loginOutcome(503, undefined) as { error: string };
    expect(outcome.error).toContain('ask again later');
    expect(outcome.error).not.toContain('certificate login instead');
  });

  it('reaches SII at the address the certificate page itself names', () => {
    expect(SII_CERT_LOGIN).toBe('https://herculesr.sii.cl/cgi_AUT2000/CAutInicio.cgi');
  });
});

/**
 * The other refusal, and the one a person is most likely to meet: SII throws
 * a certificate it does not accredit out at the handshake, so there is no
 * status and no redirect to read — only an OpenSSL string.
 */
describe('reachProblem', () => {
  it('turns the measured handshake rejection into the one thing the reader can act on', () => {
    // The exact message the real SII produced for a self-signed .p12 on
    // 2026-08-26, kept verbatim so a Node or OpenSSL upgrade that reworded it
    // is caught here rather than in front of a person.
    const measured =
      'F89B0000:error:0A000418:SSL routines:ssl3_read_bytes:tlsv1 alert unknown ca:openssl\\ssl\\record\\rec_layer_s3.c:918:SSL alert number 48';
    const said = reachProblem(measured);
    expect(said).toContain('entidad certificadora');
    expect(said).toContain(measured);
  });

  it('names an expired or revoked certificate as the certificate', () => {
    expect(reachProblem('tlsv1 alert certificate expired')).toContain('expired, revoked');
    expect(reachProblem('SSL alert number 42')).toContain('during the handshake');
  });

  it('leaves an ordinary network fault as an ordinary network fault', () => {
    const said = reachProblem('getaddrinfo ENOTFOUND herculesr.sii.cl');
    expect(said).toContain('could not be reached');
    expect(said).not.toContain('certificadora');
  });
});

// ── the question a call means ────────────────────────────────────────────────

describe('siiQuery', () => {
  const NOW = new Date(Date.UTC(2026, 7, 26));
  const ask = (name: string, args: Record<string, unknown>) => siiQuery(name, args, NOW);
  const error = (name: string, args: Record<string, unknown>) => (ask(name, args) as { error: string }).error;

  it('refuses a tool it does not have, by name', () => {
    expect(ask('accept_document', { period: '2026-07' })).toEqual({
      error: 'this connection has no tool called "accept_document" — it reads only',
    });
  });

  it('refuses the accept and claim a caller might reach for', () => {
    for (const invented of ['sendResultadoDte', 'claim_document', 'acuse_recibo', 'upload_dte']) {
      expect(error(invented, { period: '2026-07' })).toContain('it reads only');
    }
  });

  it('reads a month of compras with the register as the default section', () => {
    expect(ask('received_documents', { period: '2026-07' })).toEqual({
      query: {
        read: siiRead('received_documents'),
        side: 'received',
        period: { year: 2026, month: 7 },
        state: 'REGISTRO',
        documentType: undefined,
      },
    });
  });

  it('takes the side on the summary and refuses anything else for it', () => {
    expect(ask('register_summary', { period: '2026-07', side: 'issued' })).toMatchObject({
      query: { side: 'issued' },
    });
    expect(error('register_summary', { period: '2026-07' })).toContain('received (compras) or issued (ventas)');
    expect(error('register_summary', { period: '2026-07', side: 'ventas' })).toContain('not "ventas"');
  });

  it('refuses a side on a read whose side is fixed', () => {
    expect(error('received_documents', { period: '2026-07', side: 'issued' })).toContain(
      'has no argument called "side"',
    );
  });

  it('holds the period to one month, spelled the one way', () => {
    expect(error('received_documents', { period: '07-2026' })).toContain('as YYYY-MM');
    expect(error('received_documents', { period: '2026-7' })).toContain('as YYYY-MM');
    expect(error('received_documents', { period: '2026-07-01' })).toContain('as YYYY-MM');
    expect(error('received_documents', {})).toContain('as YYYY-MM');
    expect(error('received_documents', { period: '2026-13' })).toContain('01–12');
  });

  /**
   * The silent-wrong-answer hazard, refused: SII answers a month that has not
   * happened with an empty register, and a model would report "no documents"
   * rather than "that month has not happened".
   */
  it('refuses a month that has not happened, and allows the one in progress', () => {
    expect(ask('received_documents', { period: '2026-08' })).toHaveProperty('query');
    expect(error('received_documents', { period: '2026-09' })).toContain('has not happened yet');
    expect(error('received_documents', { period: '2027-01' })).toContain('2026-08');
  });

  it('takes each of the register’s own four sections and nothing else', () => {
    for (const state of SII_STATES) {
      expect(ask('received_documents', { period: '2026-07', state })).toMatchObject({ query: { state } });
    }
    expect(error('received_documents', { period: '2026-07', state: 'registro' })).toContain('not "registro"');
    expect(error('received_documents', { period: '2026-07', state: 'ACEPTADO' })).toContain('REGISTRO, PENDIENTE');
  });

  it('takes a document type by SII’s own code, and refuses a name', () => {
    expect(ask('received_documents', { period: '2026-07', document_type: '33' })).toMatchObject({
      query: { documentType: '33' },
    });
    expect(error('received_documents', { period: '2026-07', document_type: 'factura' })).toContain('not "factura"');
    expect(error('received_documents', { period: '2026-07', document_type: '99' })).toContain('not "99"');
  });

  it('has no document type to offer on the summary', () => {
    expect(error('register_summary', { period: '2026-07', side: 'received', document_type: '33' })).toContain(
      'has no argument called "document_type"',
    );
  });

  it('refuses an argument it does not know, and says what it does know', () => {
    const said = error('received_documents', { period: '2026-07', rut: '1-9' });
    expect(said).toContain('has no argument called "rut"');
    expect(said).toContain('period');
    expect(said).toContain('state');
  });

  it('ignores an argument that was given as nothing rather than refusing it', () => {
    expect(ask('received_documents', { period: '2026-07', document_type: '', state: null })).toMatchObject({
      query: { state: 'REGISTRO', documentType: undefined },
    });
  });
});

// ── the schema a model reads ─────────────────────────────────────────────────

describe('siiToolSchema', () => {
  it('requires the period, and the side only where it is not fixed', () => {
    expect(siiToolSchema(siiRead('register_summary')!).required).toEqual(['period', 'side']);
    expect(siiToolSchema(siiRead('received_documents')!).required).toEqual(['period']);
  });

  it('offers the document type only on the detail reads', () => {
    expect(Object.keys(siiToolSchema(siiRead('register_summary')!).properties)).toEqual(['period', 'side', 'state']);
    expect(Object.keys(siiToolSchema(siiRead('issued_documents')!).properties)).toEqual([
      'period',
      'state',
      'document_type',
    ]);
  });

  it('names every section and every document type by its own code', () => {
    const schema = siiToolSchema(siiRead('received_documents')!);
    expect(schema.properties.state).toMatchObject({ enum: [...SII_STATES] });
    expect(schema.properties.document_type).toMatchObject({
      enum: SII_DOCUMENT_TYPES.map((type) => type.code),
    });
    // A code with no name is an argument the model spends a turn guessing.
    for (const type of SII_DOCUMENT_TYPES) {
      expect(`${schema.properties.document_type.description}`).toContain(`${type.code} ${type.name}`);
    }
  });

  it('takes nothing it did not ask for', () => {
    for (const read of SII_READS) expect(siiToolSchema(read).additionalProperties).toBe(false);
  });
});

// ── the reply's own size ─────────────────────────────────────────────────────

describe('trimReply', () => {
  const envelope = (rows: number) => ({
    read: 'received_documents',
    period: '2026-07',
    sii: { data: Array.from({ length: rows }, (_, i) => ({ detNroDoc: i, detRznSoc: 'X'.repeat(200) })) },
  });

  it('passes a reply that fits through untouched', () => {
    const small = envelope(3);
    expect(JSON.parse(trimReply(small))).toEqual(small);
  });

  it('drops whole rows and says how many it kept', () => {
    const text = trimReply(envelope(500));
    expect(text.length).toBeLessThanOrEqual(SII_REPLY_CEILING);
    const parsed = JSON.parse(text) as { sii: { data: unknown[] }; trimmed: string };
    expect(parsed.sii.data.length).toBeGreaterThan(0);
    expect(parsed.sii.data.length).toBeLessThan(500);
    expect(parsed.trimmed).toContain(`of 500 rows`);
    // Whole rows, never a cut one: every row still parses as the row it was.
    for (const row of parsed.sii.data) expect(row).toHaveProperty('detRznSoc');
  });

  /**
   * The row key `sii.data` is the client's own reading of the facade, not
   * something measured against a live reply — this machine has no
   * certificate. So the case where it is wrong is the one that actually
   * happens, and it must not be silent: the reply goes back whole (a cut row
   * is a lie) and *says* it is over the ceiling and why.
   */
  it('says so when it cannot drop rows, rather than going quietly over the ceiling', () => {
    const odd = { read: 'register_summary', sii: { totals: 'Y'.repeat(SII_REPLY_CEILING + 10) } };
    const text = trimReply(odd);
    const parsed = JSON.parse(text) as { trimmed: string; sii: unknown };
    expect(text.length).toBeGreaterThan(SII_REPLY_CEILING);
    expect(parsed.sii).toEqual(odd.sii);
    expect(parsed.trimmed).toContain('sii.data');
    expect(parsed.trimmed).toContain('whole rather than cut');
  });
});

// ── the refusals ─────────────────────────────────────────────────────────────

describe('refusalMessage', () => {
  it('sends a refused read at the certificate rather than at a stack trace', () => {
    expect(refusalMessage(403, 'forbidden')).toContain("certificate's session");
    expect(refusalMessage(403, 'forbidden')).toContain('SII said: forbidden');
  });

  it('names the portal-endpoint fragility on a 404, because that is what a 404 means here', () => {
    expect(refusalMessage(404, '')).toContain('versioned by nobody');
  });

  it('keeps SII’s own words, and no more of them than a person would read', () => {
    const said = refusalMessage(500, 'x'.repeat(1000));
    expect(said).toContain('…');
    expect(said.length).toBeLessThan(500);
  });
});

// ── what actually leaves, measured on the wire ───────────────────────────────

/**
 * A session whose client answers every request out of a script and writes down
 * the address it was asked for.
 *
 * This is the only honest way to hold the read-only claim: the table above says
 * what the door *holds*, and only the wire says what the process *does*. The
 * client is the package's own `createSiiHttpClient`, so every interceptor,
 * cookie and retry it installs is in the path — just with its adapter replaced.
 */
function recordingSession(reply: unknown = { data: [] }): { session: PortalSession; asked: string[] } {
  const client = createSiiHttpClient({ rateLimitMs: 0, retries: 0 });
  const asked: string[] = [];
  client.defaults.adapter = async (config) => {
    const url = new URL(`${config.url}`, config.baseURL ?? 'https://www4.sii.cl');
    asked.push(`${config.method?.toUpperCase()} ${url.host}${url.pathname}`);
    return {
      data: url.pathname.endsWith('/aaSessionService/load') ? { data: { rut: '76123456', dv: '0' } } : reply,
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    };
  };
  const session: PortalSession = {
    httpClient: client,
    env: 'production',
    isAuthenticated: true,
    refresh: async () => {},
  };
  return { session, asked };
}

describe('against an SII that writes down what it was asked', () => {
  const login = (session: PortalSession): SiiLogin => async () => session;

  it('lands every read on the facade address its own table names, and nowhere else', async () => {
    for (const read of SII_READS) {
      const { session, asked } = recordingSession();
      const door = siiDoor({ rut: RUT, certPath: 'unused', certPassword: 'unused' }, login(session));
      const result = await door.read(read.name, {
        period: '2026-07',
        ...(read.side ? {} : { side: 'received' }),
      });
      expect(result.ok, `${read.name}: ${result.text}`).toBe(true);

      const paths = asked.map((line) => line.replace(/^\S+ [^/]+/, ''));
      expect(paths, `${read.name} did not reach its own address`).toContain(read.endpoint);
      // Every address, not only the one it meant to reach.
      for (const path of paths) {
        expect(
          [...FACADE_READS, ...SESSION_SETUP].includes(path),
          `${read.name} asked for ${path}, which is not a read address this door holds`,
        ).toBe(true);
      }
    }
  });

  it('never touches an address that would change anything at the SII', async () => {
    const { session, asked } = recordingSession();
    const door = siiDoor({ rut: RUT, certPath: 'unused', certPassword: 'unused' }, login(session));
    for (const read of SII_READS) {
      // Each read is given what *it* takes: a `side` handed to a read whose
      // side is fixed is refused before the wire, and a refused read would
      // make this whole check pass by never asking SII anything.
      const result = await door.read(read.name, {
        period: '2026-07',
        ...(read.side ? {} : { side: 'received' }),
        ...(read.documentType ? { document_type: '33' } : {}),
      });
      expect(result.ok, `${read.name} never reached the wire: ${result.text}`).toBe(true);
    }
    const whole = asked.join('\n');
    // The upload path the package's own session check uses, the SOAP services
    // that carry a signed DTE, and the acceptance services — by name.
    for (const forbidden of ['/cgi_dte/', 'DTEUpload', '/DTEWS/', 'RecepcionDTE', 'CrSeed', 'GetTokenFromSeed']) {
      expect(whole, `something asked for ${forbidden}`).not.toContain(forbidden);
    }
    expect(asked.length).toBeGreaterThan(0);
  });

  it('costs no login at all when the question is wrong', async () => {
    let loggedIn = 0;
    const door = siiDoor({ rut: RUT, certPath: 'unused', certPassword: 'unused' }, async () => {
      loggedIn++;
      return recordingSession().session;
    });
    expect((await door.read('received_documents', { period: 'julio' })).ok).toBe(false);
    expect((await door.read('sendResultadoDte', { period: '2026-07' })).ok).toBe(false);
    expect(loggedIn, 'a misspelled argument opened a session at the SII').toBe(0);
  });

  it('opens one session and keeps it, because SII limits them per RUT', async () => {
    let loggedIn = 0;
    const { session } = recordingSession();
    const door = siiDoor({ rut: RUT, certPath: 'unused', certPassword: 'unused' }, async () => {
      loggedIn++;
      return session;
    });
    for (const read of SII_READS) {
      const result = await door.read(read.name, { period: '2026-07', ...(read.side ? {} : { side: 'received' }) });
      expect(result.ok, `${read.name} never reached the wire: ${result.text}`).toBe(true);
    }
    expect(loggedIn).toBe(1);
  });

  it('says what it was asked beside what SII answered, since SII echoes nothing', async () => {
    const { session } = recordingSession({ data: [{ detNroDoc: 41, detRznSoc: 'PROVEEDOR SPA' }] });
    const door = siiDoor({ rut: RUT, certPath: 'unused', certPassword: 'unused' }, login(session));
    const result = await door.read('received_documents', {
      period: '2026-07',
      state: 'PENDIENTE',
      document_type: '33',
    });
    expect(result.ok).toBe(true);
    expect(JSON.parse(result.text)).toMatchObject({
      read: 'received_documents',
      rut: RUT,
      period: '2026-07',
      side: 'received',
      state: 'PENDIENTE',
      documentType: '33',
      sii: { data: [{ detNroDoc: 41, detRznSoc: 'PROVEEDOR SPA' }] },
    });
  });

  /**
   * The portal-endpoint fragility, made to do something rather than only be
   * documented: the facade answering a login page instead of JSON is what a
   * moved address looks like, and it must never be parsed into a confident
   * empty answer.
   */
  it('calls a page where the register should be a moved address, not an empty month', async () => {
    const { session } = recordingSession('<html><body>Ingresar</body></html>');
    const door = siiDoor({ rut: RUT, certPath: 'unused', certPassword: 'unused' }, login(session));
    const result = await door.read('issued_documents', { period: '2026-07' });
    expect(result.ok).toBe(false);
    expect(result.text).toContain('may have moved');
    expect(result.text).toContain('getDetalleVenta');
  });

  it('gives the session back when it is closed, and does not go looking for one it never opened', async () => {
    const { session, asked } = recordingSession();
    const door = siiDoor({ rut: RUT, certPath: 'unused', certPassword: 'unused' }, login(session));
    await door.close();
    expect(asked, 'a door that never read logged out of nothing').toEqual([]);

    await door.read('received_documents', { period: '2026-07' });
    await door.close();
    const logout = new URL(SII_LOGOUT);
    expect(asked.some((line) => line.includes(`${logout.host}${logout.pathname}`))).toBe(true);
  });

  /**
   * The retry goes back through `login`, not through `session.refresh()`.
   * Review found the door calling refresh, which on the real session calls
   * `certificateLogin` directly — so the one path a test could not reach was
   * the retry, and this test would have been asserting a double it wired
   * itself. Counting logins through the seam is what makes it real.
   */
  it('logs in again through the seam when SII says the session expired, and only once', async () => {
    let loggedIn = 0;
    let calls = 0;
    const door = siiDoor({ rut: RUT, certPath: 'unused', certPassword: 'unused' }, async () => {
      loggedIn++;
      const { session } = recordingSession();
      const inner = session.httpClient.defaults.adapter!;
      session.httpClient.defaults.adapter = async (config) => {
        // The package throws its own error the first time it sees SII's sentence.
        if (`${config.url}`.includes('getDetalleCompra') && calls++ === 0) throw new emisso.SiiAuthExpiredError();
        return (inner as (c: typeof config) => Promise<never>)(config);
      };
      session.refresh = async () => {
        throw new Error('the door must not reach past its own seam to refresh');
      };
      return session;
    });
    const result = await door.read('received_documents', { period: '2026-07' });
    expect(result.ok, result.text).toBe(true);
    expect(loggedIn, 'the retry did not go through the seam').toBe(2);
  });

  it('says so plainly when logging in again did not help either', async () => {
    let loggedIn = 0;
    const door = siiDoor({ rut: RUT, certPath: 'unused', certPassword: 'unused' }, async () => {
      loggedIn++;
      const { session } = recordingSession();
      session.httpClient.defaults.adapter = async () => {
        throw new emisso.SiiAuthExpiredError();
      };
      return session;
    });
    const result = await door.read('received_documents', { period: '2026-07' });
    expect(result.ok).toBe(false);
    expect(result.text).toContain('no longer authenticated');
    // Twice and no more: one original, one retry. A door that kept trying
    // would hold SII's per-RUT session limit open against its own user.
    expect(loggedIn).toBe(2);
  });
});
