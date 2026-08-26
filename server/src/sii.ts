/**
 * The SII purchases and sales register, read-only (#19, D-252, D-250).
 *
 * The *Registro de Compras y Ventas* is where every electronic tax document a
 * Chilean company issued or received lands. The SII publishes **no API** for
 * it: the register is a single-page app at `www4.sii.cl/consdcvinternetui/`
 * talking to its own JSON facade, and the only way in is the portal login. So
 * a door to it is not a catalog line — this module is its whole mind, and
 * `scripts/sii-mcp.mts` is the mouth.
 *
 * ## The credential is the certificate, and the ticket's premise was wrong
 *
 * D-252 settled that a door may hold an API key, an OAuth token or a
 * **certificate file** — and that a portal username and password is *never*
 * one. It also recorded that an open-source client for the certificate path
 * exists. Read against the code on 2026-08-26, that second half is false:
 * `@emisso/sii`'s only portal login is `portalLogin({ rut, claveTributaria })`,
 * which types a RUT and a **clave tributaria** into `#rutcntr` and `#clave` in
 * a headless Playwright browser. Its certificate function (`authenticate`)
 * reaches the SOAP token services and never the register.
 *
 * SII's own portal does offer the certificate, and that is what this door
 * uses. `IngresoCertificado.html` posts to `herculesr.sii.cl`, and that host
 * asks for a TLS client certificate in the handshake — measured 2026-08-26,
 * `openssl s_client` prints *Acceptable client certificate CA names*, and a
 * POST with no certificate answers `302 -> homer.sii.cl/errorp.html`. So the
 * login here is **mutual TLS with the `.p12`**, in one request, and the
 * session cookies carry every read after it. Nothing else about the login is
 * held: no password, no clave, no browser, no profile.
 *
 * ## Read-only is a property of the table, measured on the wire
 *
 * Buk's guarantee (D-266) was that one request function hard-codes `GET`. It
 * cannot be that here — SII's facade answers reads over `POST`, so the method
 * says nothing. The guarantee instead is that **this module names three
 * addresses and imports no write**: `@emisso/sii` also exports `uploadDte`,
 * `requestFolios`, `sendAcuseRecibo`, `sendReciboMercaderias` and
 * `sendResultadoDte`, and not one of them appears below. `sii.test.ts` proves
 * it the only way a table can be proved — by driving every tool through the
 * real request path at a client that writes down every address it was asked
 * for, and asserting the set.
 *
 * **Accept and claim are excluded by name.** Accepting or claiming a received
 * DTE is the first act beyond the send, and D-250 keeps it for the acts
 * ledger, which is built for that act rather than ahead of it. Measured while
 * building this: in `@emisso/sii@0.1.1` every write is a
 * `throw new Error("Not implemented")` stub — `sendResultadoDte`,
 * `sendAcuseRecibo`, `sendReciboMercaderias`, `uploadDte`, `requestFolios`,
 * and the whole `queryDteStatus` family with them. So the package cannot
 * write to SII today whatever anyone imports, which makes the exclusion cheap
 * rather than load-bearing, and is exactly why it is not the guarantee:
 * `sii.test.ts` asserts that those names still throw, so the version that
 * implements one arrives as a failing test and someone re-reads this door
 * instead of finding out later.
 *
 * ## The portal-endpoint fragility, named
 *
 * These addresses are not a contract. They were read out of the SPA's own
 * JavaScript bundle (by `@emisso/sii`, whose constants this module uses rather
 * than copying), they are versioned by nobody, documented by nobody, and the
 * SII may change them in any release without telling anyone — unlike D-266's
 * Buk, whose every path came off a published Swagger contract the proof
 * re-reads on each run. There is no contract here to re-read. The one thing
 * that can be done about it is done: a reply that is not the register's JSON
 * is reported as *the endpoint may have moved*, by name, rather than being
 * parsed into a confident wrong answer.
 */
import { readFileSync } from 'node:fs';
import { Agent } from 'node:https';
import { createSecureContext } from 'node:tls';
import { clip, trimToCeiling } from './doorreply';
// Only reads. The five write functions this package also exports are absent on
// purpose, and `sii.test.ts` asserts the absence against the package's own
// export list, so a later import cannot add one quietly.
import {
  ESTADO_CONTAB,
  RCV_ENDPOINTS,
  SiiAuthExpiredError,
  createSiiHttpClient,
  fetchRcvDetalle,
  fetchRcvResumen,
  formatRut,
  validateRut,
  type DteType,
  type ListInvoicesParams,
  type PortalSession,
} from '@emisso/sii';

/** Where SII's certificate login lives, and the only address the key ever meets. */
export const SII_CERT_LOGIN = 'https://herculesr.sii.cl/cgi_AUT2000/CAutInicio.cgi';

/** Where the portal is asked to land after the login — SII's own post-login home. */
export const SII_REFERENCIA = 'https://misii.sii.cl/cgi_misii/siihome.cgi';

/** Where SII sends a login it would not take. Measured 2026-08-26. */
export const SII_REJECTED = 'errorp.html';

/** The only host family this door will follow a redirect to. */
export const SII_HOST_SUFFIX = '.sii.cl';

/** Where a session is given back, so the company is not locked out of its own register. */
export const SII_LOGOUT = 'https://zeusr.sii.cl/cgi_AUT2000/CAutInwor498.cgi?https://www.sii.cl';

/**
 * The most JSON one read may answer with.
 *
 * A month of a real company's compras is hundreds of rows, and a truncated row
 * is a lie about a tax document — so the unit is the row and the loss is always
 * stated. Same ceiling and same reason as D-266's Buk.
 */
export const SII_REPLY_CEILING = 40_000;

/** How long to wait for SII before saying it did not answer. */
const SII_TIMEOUT_MS = 60_000;

/** The register's four sections, in SII's own spelling. */
export const SII_STATES = [
  ESTADO_CONTAB.REGISTRO,
  ESTADO_CONTAB.PENDIENTE,
  ESTADO_CONTAB.NO_INCLUIR,
  ESTADO_CONTAB.RECLAMADO,
] as const;
export type SiiState = (typeof SII_STATES)[number];

/** The document types the register distinguishes, with SII's own names. */
export const SII_DOCUMENT_TYPES: { code: DteType; name: string }[] = [
  { code: '33', name: 'factura electrónica' },
  { code: '34', name: 'factura no afecta o exenta electrónica' },
  { code: '39', name: 'boleta electrónica' },
  { code: '41', name: 'boleta no afecta o exenta electrónica' },
  { code: '43', name: 'liquidación factura electrónica' },
  { code: '46', name: 'factura de compra electrónica' },
  { code: '52', name: 'guía de despacho electrónica' },
  { code: '56', name: 'nota de débito electrónica' },
  { code: '61', name: 'nota de crédito electrónica' },
  { code: '110', name: 'factura de exportación electrónica' },
  { code: '112', name: 'nota de crédito de exportación electrónica' },
];

/** Which half of the register a read is about. */
export type SiiSide = 'received' | 'issued';

export interface SiiRead {
  /** The tool name a session calls, after the `mcp__sii__` prefix. */
  name: string;
  summary: string;
  /** The facade address this read lands on, from the package's own constants. */
  endpoint: string;
  /**
   * The client function that asks that address.
   *
   * Carried on the row rather than chosen by a `name === 'register_summary'`
   * test at the call site: with the literal, the table said one address while
   * the dispatch picked another and nothing would have noticed them drift.
   * Here the row that names `getResumen` is the row that calls the function
   * which asks for `getResumen`, and the wire test reads the addresses back.
   */
  ask: (session: PortalSession, params: ListInvoicesParams) => Promise<unknown>;
  /** Fixed for the two detail reads; asked for on the summary. */
  side?: SiiSide;
  /** Whether the read takes a document-type filter. */
  documentType: boolean;
}

/**
 * The three reads, and there is no fourth.
 *
 * They are the ticket's two sentences. *A period's received and issued DTEs
 * with their state* is `received_documents` and `issued_documents`, asked of
 * one of the register's four sections; *a document's detail* is a row of those
 * — SII's facade holds a document's detail nowhere else, and the row carries
 * the issuer, the folio, the dates and every tax amount. The summary is what
 * tells a caller which document types a period even has, so it is here rather
 * than leaving the caller to guess a type and read an empty answer.
 */
export const SII_READS: SiiRead[] = [
  {
    name: 'register_summary',
    summary:
      'Totals for one month of the purchases and sales register, broken down by document type — how many documents of each type and what they add up to. Read this first: it says which document types the period actually has. Reads only.',
    endpoint: RCV_ENDPOINTS.getResumen,
    ask: fetchRcvResumen,
    documentType: false,
  },
  {
    name: 'received_documents',
    summary:
      'The documents RECEIVED (compras) in one month of the register, one row per document with its issuer, folio, date, amounts and taxes, as SII holds them. Reads only — it cannot accept, claim or reject anything.',
    endpoint: RCV_ENDPOINTS.getDetalleCompra,
    ask: fetchRcvDetalle,
    side: 'received',
    documentType: true,
  },
  {
    name: 'issued_documents',
    summary:
      'The documents ISSUED (ventas) in one month of the register, one row per document with its receiver, folio, date, amounts and taxes, as SII holds them. Reads only — it cannot issue or cancel anything.',
    endpoint: RCV_ENDPOINTS.getDetalleVenta,
    ask: fetchRcvDetalle,
    side: 'issued',
    documentType: true,
  },
];

/** The read a tool name means, or nothing — the only way a name becomes an address. */
export function siiRead(name: string): SiiRead | undefined {
  return SII_READS.find((read) => read.name === name);
}

/**
 * What is wrong with a RUT, or null.
 *
 * The package's own `validateRut` is the modulo-11 check and is used for it,
 * but it is not enough on its own: it answers `true` for `761234560`, which
 * the package's own `splitRut` then throws on — measured 2026-08-26. So the
 * dash is required here, before anything downstream is handed a shape it
 * cannot take.
 */
export function rutProblem(rut: string): string | null {
  const raw = rut.trim();
  if (!raw) return 'no RUT — pass --rut <rut>, the company whose register is read, as 76123456-0';
  const formatted = formatRut(raw);
  if (!/^\d{1,8}-[\dkK]$/.test(formatted)) {
    return `"${raw}" is not a RUT — write it with its verifying digit after a dash, as 76123456-0`;
  }
  if (!validateRut(formatted)) {
    return `"${raw}" fails its own check digit — the character after the dash does not match the number`;
  }
  return null;
}

/**
 * What is wrong with the certificate, or null.
 *
 * Opened here rather than at the first read, so a connection cannot be
 * *stored* with a certificate that does not work: the add flow probes before
 * it writes (D-244), and a probe that succeeds is the app's claim that this
 * works. Node's own PKCS#12 reader does the opening, and OpenSSL's messages
 * are measured rather than guessed — a wrong password is `mac verify failure`
 * and a file that is not a `.p12` is `not enough data` (2026-08-26).
 *
 * The private key is never returned. This answers a sentence or nothing; the
 * bytes are read again, at the one moment they are used.
 */
export function certProblem(certPath: string, password: string): string | null {
  if (!certPath.trim()) {
    return 'SII_CERT_PATH is not set — it is the path to your SII digital certificate, a .p12 or .pfx file';
  }
  if (!password) {
    return 'SII_CERT_PASSWORD is not set — it is the password that opens the certificate file, and nothing else about the SII login is held';
  }
  let pfx: Buffer;
  try {
    pfx = readFileSync(certPath);
  } catch {
    return `there is no certificate at ${certPath} — SII_CERT_PATH must point at the .p12 file itself`;
  }
  try {
    createSecureContext({ pfx, passphrase: password });
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    if (/mac verify failure/i.test(why)) {
      return 'SII_CERT_PASSWORD does not open the certificate — the file is a PKCS#12 but that is not its password';
    }
    return `the file at ${certPath} is not a certificate this can open — ${why}`;
  }
  return null;
}

/**
 * What SII's answer to the certificate login means.
 *
 * Kept a pure function of the status and the `location`, because it is the one
 * piece of the login that can be held to every case without a real
 * certificate — and the one certificate-less case, the rejection, is measured
 * against the live SII on every proof run.
 */
export function loginOutcome(
  status: number,
  location: string | undefined,
): { next: string } | { error: string } {
  if (status >= 500) {
    return { error: `SII answered ${status} to the certificate login — the portal is unwell, ask again later` };
  }
  if (status !== 301 && status !== 302 && status !== 303) {
    return {
      error: `SII answered ${status} to the certificate login instead of sending us on — the login page may have changed`,
    };
  }
  if (!location) {
    return { error: 'SII redirected the certificate login to nowhere — the login page may have changed' };
  }
  if (location.includes(SII_REJECTED)) {
    return {
      error:
        'SII would not take the certificate — it sent the login to its error page. Either no certificate reached SII, or this one is expired, revoked, or not one SII accepts.',
    };
  }
  // Where the login goes next is chosen by the far end, and the next thing
  // this door does is fetch it. Cookies are scoped to sii.cl by the jar, so
  // an off-domain hop would carry no session — but it would still be this
  // process fetching an address a redirect picked, which is not something to
  // leave to a header. Checked here rather than at the fetch, so the rule is
  // a pure function with the rest of the login's reading (D-266's
  // `redirect: 'error'` is the same discipline, one step earlier).
  let host: string;
  try {
    const parsed = new URL(location);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { error: `SII sent the login to "${location}", which is not a web address — refused` };
    }
    host = parsed.host;
  } catch {
    return { error: `SII sent the login to "${location}", which is not an address this can read — refused` };
  }
  const bare = host.replace(/:\d+$/, '');
  if (bare !== 'sii.cl' && !bare.endsWith(SII_HOST_SUFFIX)) {
    return { error: `SII sent the login on to ${host}, which is not an SII address — refused rather than followed` };
  }
  return { next: location };
}

/**
 * What a failed connection to the certificate login means.
 *
 * SII refuses a certificate it does not accept **at the TLS handshake**, not
 * at the HTTP layer — measured 2026-08-26 with a self-signed `.p12`: the login
 * never answers, it sends `tlsv1 alert unknown ca` and closes. So the reader
 * would otherwise get an OpenSSL string where a sentence belongs, and the one
 * thing they can act on — *this is not a certificate SII accredits* — would be
 * the one thing not said. `loginOutcome` covers the other case, no certificate
 * at all, which does reach HTTP and answers a redirect.
 */
export function reachProblem(why: string): string {
  if (/unknown ca|alert number 48/i.test(why)) {
    return `SII will not accept the authority that issued this certificate — it closed the connection rather than answering. An SII login needs a certificate from an entidad certificadora the SII accredits. (${why})`;
  }
  if (/handshake failure|alert number 40|bad certificate|alert number 42|certificate expired|alert number 45/i.test(why)) {
    return `SII refused this certificate during the handshake — it may be expired, revoked, or not one SII accepts. (${why})`;
  }
  return `SII's certificate login at ${new URL(SII_CERT_LOGIN).host} could not be reached — ${why}`;
}

/** What a tool call means as a register question. */
export interface SiiQuery {
  read: SiiRead;
  side: SiiSide;
  period: { year: number; month: number };
  state: SiiState;
  documentType?: DteType;
}

/**
 * The register question a tool call means, or what is wrong with it.
 *
 * Every refusal names the tool, the argument and what was wanted, because the
 * reader is a model that will otherwise retry the same shape: "not valid"
 * costs a turn, "wants YYYY-MM" costs none.
 */
export function siiQuery(
  toolName: string,
  args: Record<string, unknown>,
  now: Date,
): { query: SiiQuery } | { error: string } {
  const read = siiRead(toolName);
  if (!read) return { error: `this connection has no tool called "${toolName}" — it reads only` };

  const known = new Set<string>(['period', 'state']);
  if (!read.side) known.add('side');
  if (read.documentType) known.add('document_type');
  for (const [name, value] of Object.entries(args)) {
    if (value === undefined || value === null || value === '') continue;
    if (!known.has(name)) {
      return { error: `${read.name} has no argument called "${name}" — it takes ${[...known].join(', ')}` };
    }
  }

  const period = periodOf(read.name, args.period, now);
  if ('error' in period) return period;

  let side = read.side;
  if (!side) {
    const raw = args.side;
    if (raw !== 'received' && raw !== 'issued') {
      return {
        error: `${read.name} wants "side" to be received (compras) or issued (ventas) — not "${raw ?? ''}"`,
      };
    }
    side = raw;
  }

  let state: SiiState = ESTADO_CONTAB.REGISTRO;
  if (args.state !== undefined && args.state !== null && args.state !== '') {
    const raw = `${args.state}`;
    if (!(SII_STATES as readonly string[]).includes(raw)) {
      return { error: `${read.name} wants "state" to be one of ${SII_STATES.join(', ')} — not "${raw}"` };
    }
    state = raw as SiiState;
  }

  let documentType: DteType | undefined;
  const askedType = args.document_type;
  if (read.documentType && askedType !== undefined && askedType !== null && askedType !== '') {
    const raw = `${askedType}`;
    const found = SII_DOCUMENT_TYPES.find((type) => type.code === raw);
    if (!found) {
      return {
        error: `${read.name} wants "document_type" to be one of ${SII_DOCUMENT_TYPES.map((t) => t.code).join(', ')} — not "${raw}"`,
      };
    }
    documentType = found.code;
  }

  return { query: { read, side, period: period.period, state, documentType } };
}

/**
 * The month a `period` argument means.
 *
 * A period after this one is refused rather than asked, because SII answers an
 * empty register for it and a model would report *no documents* for a month
 * that has not happened — a wrong answer where an error belongs, the same
 * hazard D-266 met in Buk's two date formats.
 */
function periodOf(
  toolName: string,
  raw: unknown,
  now: Date,
): { period: { year: number; month: number } } | { error: string } {
  const text = `${raw ?? ''}`.trim();
  const match = /^(\d{4})-(\d{2})$/.exec(text);
  if (!match) return { error: `${toolName} wants "period" as YYYY-MM, one month — "${text}" is not` };
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    return { error: `${toolName} wants "period" to name a month 01–12 — "${text}" does not` };
  }
  if (year * 12 + (month - 1) > now.getFullYear() * 12 + now.getMonth()) {
    const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return {
      error: `${toolName} cannot read "${text}" — that month has not happened yet; the register goes up to ${current}`,
    };
  }
  return { period: { year, month } };
}

/** The MCP input schema for one read, built from what that read takes. */
export function siiToolSchema(read: SiiRead): {
  type: 'object';
  properties: Record<string, Record<string, unknown>>;
  required: string[];
  additionalProperties: false;
} {
  const properties: Record<string, Record<string, unknown>> = {
    period: {
      type: 'string',
      description: 'the tax month to read, as YYYY-MM; it cannot be a month that has not happened yet',
    },
  };
  const required = ['period'];
  if (!read.side) {
    properties.side = {
      type: 'string',
      enum: ['received', 'issued'],
      description: 'received for compras (what the company was sent), issued for ventas (what it sent)',
    };
    required.push('side');
  }
  properties.state = {
    type: 'string',
    enum: [...SII_STATES],
    description:
      'which section of the register to read, in SII’s own spelling: REGISTRO the documents in the register proper (the default), PENDIENTE received documents still inside the acceptance window, NO_INCLUIR ones marked not to be included, RECLAMADO ones the company has claimed against',
  };
  if (read.documentType) {
    properties.document_type = {
      type: 'string',
      enum: SII_DOCUMENT_TYPES.map((type) => type.code),
      description: `the document type to read, by SII’s code — ${SII_DOCUMENT_TYPES.map((t) => `${t.code} ${t.name}`).join(', ')}. Leave it out for every type; run register_summary first to see which the period has`,
    };
  }
  return { type: 'object', properties, required, additionalProperties: false };
}


/**
 * An SII refusal as a sentence.
 *
 * **These statuses are not measured, and that is the honest difference from
 * D-266.** Buk's table was read off a live API with a wrong key; SII's facade
 * only answers a session a certificate opened, and this machine has no
 * certificate. So each line says what the status means *for what the reader
 * can change* and keeps SII's own words beside it, and the table as a whole is
 * a claim to check on the first real run rather than a measurement.
 */
export function refusalMessage(status: number, body: string): string {
  const said = clip(body);
  const tail = said ? ` SII said: ${said}` : '';
  switch (status) {
    case 401:
    case 403:
      return `SII refused the read (${status}) — the certificate's session is not one it will answer this for. It may have expired, or the certificate may not represent this RUT.${tail}`;
    case 404:
      return `SII has no such address any more (404) — the register is a single-page app whose addresses are versioned by nobody, so this door may need re-reading against the portal.${tail}`;
    case 429:
      return `SII is rate-limiting this session (429) — wait and ask again.${tail}`;
    default:
      if (status >= 500) return `SII answered ${status} — the portal is unwell, ask again later.${tail}`;
      return `SII answered ${status}.${tail}`;
  }
}

/**
 * A register reply as text, under the ceiling.
 *
 * Rows are dropped whole and the loss is *stated*: a reply cut mid-row is
 * invalid JSON, and a reply quietly shortened is the worst of both — the
 * reader believes it has the month. The mechanism is shared with D-266's Buk
 * (`doorreply.ts`); what is this door's is the key, the ceiling and the words.
 *
 * **The row key is not measured.** `sii.data` is where `@emisso/sii`'s own
 * `fetchDetalleAndParse` and `extractDocTypesFromResumen` read the rows, so it
 * is the client's reading of the facade rather than a guess — but no live
 * reply has ever been seen here, because this machine has no certificate. If
 * the shape differs the ceiling cannot apply, and that case is **said** rather
 * than passed over: a reply that could not be trimmed carries `trimmed`
 * explaining why it is over the ceiling and whole. Buk chose the opposite
 * default for the same case, deliberately (#18's own test asserts it).
 *
 * **What the ceiling costs.** A large month, trimmed, can put a particular
 * document out of reach — the only narrowing this door offers is
 * `document_type` and `state`, and the facade has no per-document address to
 * fall back on. D-267 records that as a real limit rather than as a detail.
 */
export function trimReply(envelope: Record<string, unknown>): string {
  return trimToCeiling(envelope, {
    ceiling: SII_REPLY_CEILING,
    path: ['sii', 'data'],
    note: (kept, total) =>
      `kept ${kept} of ${total} rows — the reply passed this connection's ${SII_REPLY_CEILING}-character ceiling; ask again for one document_type at a time`,
    untrimmable: (chars) =>
      `this reply is ${chars} characters, past this connection's ${SII_REPLY_CEILING}-character ceiling, and holds no row list at "sii.data" to drop rows from — it is whole rather than cut, and the facade may have changed shape`,
  });
}

export interface SiiCertConfig {
  certPath: string;
  certPassword: string;
}

export interface SiiDoorConfig extends SiiCertConfig {
  /** The company whose register is read, `76123456-0`. Configuration, never a secret. */
  rut: string;
}

/** How a session is opened. One implementation ships; the tests supply another. */
export type SiiLogin = (config: SiiCertConfig) => Promise<PortalSession>;

/**
 * The certificate login — **the only place the private key leaves this
 * machine.**
 *
 * One request, over a mutual-TLS connection carrying the `.p12`. What comes
 * back is a redirect and a set of cookies; every read after this one is an
 * ordinary HTTPS request carrying those cookies and no key at all. (The key is
 * *read* in one other place — `certProblem` opens the file to check the
 * password before anything is stored — but that is local and sends nothing.)
 *
 * The redirect is **read rather than followed**: `maxRedirects: 0` on the
 * request holding the key, and then `loginOutcome` checks that where SII wants
 * to send us is an SII address at all before this function fetches it. Neither
 * half is free — the first keeps the key's connection from being redirected,
 * and the second keeps this process from fetching whatever a `Location` named.
 */
export async function certificateLogin(config: SiiCertConfig): Promise<PortalSession> {
  const problem = certProblem(config.certPath, config.certPassword);
  if (problem) throw new Error(problem);

  const client = createSiiHttpClient({ rateLimitMs: 0 });
  const agent = new Agent({
    pfx: readFileSync(config.certPath),
    passphrase: config.certPassword,
    keepAlive: false,
  });

  let status: number;
  let location: string | undefined;
  try {
    const response = await client.post(
      `${SII_CERT_LOGIN}?${SII_REFERENCIA}`,
      new URLSearchParams({ referencia: SII_REFERENCIA }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        httpsAgent: agent,
        maxRedirects: 0,
        validateStatus: () => true,
        timeout: SII_TIMEOUT_MS,
      },
    );
    status = response.status;
    const raw = response.headers.location;
    location = typeof raw === 'string' ? raw : undefined;
  } catch (err) {
    throw new Error(reachProblem(err instanceof Error ? err.message : String(err)));
  } finally {
    // The key's connection is closed the moment the login is answered, so a
    // later read cannot reuse it by accident.
    agent.destroy();
  }

  const outcome = loginOutcome(status, location);
  if ('error' in outcome) throw new Error(outcome.error);

  // The cookies are the session now. This request carries no certificate, and
  // neither does any read after it.
  await client.get(outcome.next, { validateStatus: () => true, timeout: SII_TIMEOUT_MS });

  const session: PortalSession = {
    httpClient: client,
    env: 'production',
    isAuthenticated: true,
    refresh: async () => {
      const fresh = await certificateLogin(config);
      session.httpClient = fresh.httpClient;
      session.isAuthenticated = fresh.isAuthenticated;
    },
  };
  return session;
}

/** One connection to the register: the reads, and the session behind them. */
export interface SiiDoor {
  read(toolName: string, args: Record<string, unknown>): Promise<{ ok: boolean; text: string }>;
  close(): Promise<void>;
}

/**
 * The door.
 *
 * The session is opened on the **first read worth making** — arguments are
 * checked first, so a misspelled period costs no login. It is kept afterwards
 * rather than reopened per call, because SII limits concurrent sessions per RUT
 * and each read is already several requests to the portal; when it expires, the
 * package says so by name and the door logs in again, once.
 *
 * `login` is a seam for the tests and nothing else — the shipped value is the
 * real certificate login, and it is the only one any caller passes (D-187: a
 * seam is widened where a test needs it, and the reason is recorded).
 */
export function siiDoor(config: SiiDoorConfig, login: SiiLogin = certificateLogin): SiiDoor {
  let session: PortalSession | null = null;
  const rut = formatRut(config.rut);

  async function ensure(): Promise<PortalSession> {
    if (!session) session = await login(config);
    return session;
  }

  async function ask(query: SiiQuery, portal: PortalSession): Promise<unknown> {
    const params = {
      rut,
      issueType: query.side,
      period: query.period,
      estadoContab: query.state,
      ...(query.documentType ? { documentType: query.documentType } : {}),
    };
    return query.read.ask(portal, params);
  }

  return {
    async read(toolName, args) {
      const built = siiQuery(toolName, args, new Date());
      if ('error' in built) return { ok: false, text: built.error };
      const { query } = built;

      let reply: unknown;
      try {
        reply = await ask(query, await ensure());
      } catch (err) {
        // SII said "NO ESTA AUTENTICADO". One certificate login, one retry: a
        // session that expires mid-question is ordinary, and a refusal the
        // model cannot act on would cost a turn for nothing.
        if (err instanceof SiiAuthExpiredError && session) {
          try {
            // Through `login`, not through `session.refresh()`. The seam is
            // the only way this door opens a session, and a retry that went
            // round it would be the one path no test ever exercised — which
            // is exactly what review found here.
            session = await login(config);
            reply = await ask(query, session);
          } catch (again) {
            return { ok: false, text: whyNot(again) };
          }
        } else {
          return { ok: false, text: whyNot(err) };
        }
      }

      if (!reply || typeof reply !== 'object') {
        const said = clip(typeof reply === 'string' ? reply : `${reply}`);
        return {
          ok: false,
          text: `SII answered with a page rather than the register — its addresses are the single-page app's own and are versioned by nobody, so ${query.read.endpoint} may have moved.${said ? ` It said: ${said}` : ''}`,
        };
      }

      return {
        ok: true,
        text: trimReply({
          read: query.read.name,
          rut,
          period: `${query.period.year}-${String(query.period.month).padStart(2, '0')}`,
          side: query.side,
          state: query.state,
          ...(query.documentType ? { documentType: query.documentType } : {}),
          sii: reply,
        }),
      };
    },

    async close() {
      // SII limits concurrent sessions per RUT, so a door that walked away
      // holding one would lock the company out of its own register.
      if (!session) return;
      const held = session;
      session = null;
      try {
        await held.httpClient.get(SII_LOGOUT, { validateStatus: () => true, timeout: SII_TIMEOUT_MS });
      } catch {
        // Nothing a caller can do about a logout that did not land, and the
        // session expires on SII's own clock regardless.
      }
    },
  };
}

/** Why a read did not happen, as a sentence rather than a stack. */
function whyNot(err: unknown): string {
  if (err instanceof SiiAuthExpiredError) {
    return 'SII says this session is no longer authenticated, and logging in again with the certificate did not help — try once more, and check the certificate has not expired.';
  }
  const response = (err as { response?: { status?: number; data?: unknown } })?.response;
  if (typeof response?.status === 'number') {
    const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? '');
    return refusalMessage(response.status, body);
  }
  return `SII could not be reached — ${err instanceof Error ? err.message : String(err)}`;
}
