/**
 * One real call per connection at paste time, so a bad key fails in the
 * drawer and not in a job (D-076). Each validator reads its secret from the
 * env view it is handed, and answers with either an identity worth showing
 * ("connected as @agentlings_bot") or the provider's own refusal. A secret
 * value never appears in a reason.
 */
export interface Validation {
  ok: boolean;
  /** Who the token turned out to be, when the provider says. */
  identity?: string;
  reason?: string;
}

type Env = Record<string, string | undefined>;
export type Validator = (env: Env, fetchFn: typeof fetch) => Promise<Validation>;

const TIMEOUT_MS = 10_000;

async function call(
  fetchFn: typeof fetch,
  provider: string,
  url: string,
  headers?: Record<string, string>,
): Promise<{ res?: Response; reason?: string }> {
  try {
    return { res: await fetchFn(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) }) };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { reason: `could not reach ${provider}: ${detail}` };
  }
}

const telegram: Validator = async (env, fetchFn) => {
  const { res, reason } = await call(
    fetchFn,
    'Telegram',
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`,
  );
  if (!res) return { ok: false, reason };
  if (res.ok) {
    const body = (await res.json().catch(() => null)) as {
      result?: { username?: string };
    } | null;
    const username = body?.result?.username;
    return { ok: true, ...(username ? { identity: `@${username}` } : {}) };
  }
  if (res.status === 401 || res.status === 404) {
    return { ok: false, reason: 'Telegram rejected the token — check what @BotFather sent' };
  }
  return { ok: false, reason: `Telegram answered HTTP ${res.status}` };
};

const github: Validator = async (env, fetchFn) => {
  const { res, reason } = await call(fetchFn, 'GitHub', 'https://api.github.com/user', {
    accept: 'application/vnd.github+json',
    'user-agent': 'agentlings',
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
  });
  if (!res) return { ok: false, reason };
  if (res.ok) {
    const body = (await res.json().catch(() => null)) as { login?: string } | null;
    return { ok: true, ...(body?.login ? { identity: body.login } : {}) };
  }
  if (res.status === 401) return { ok: false, reason: 'GitHub rejected the token' };
  return { ok: false, reason: `GitHub answered HTTP ${res.status}` };
};

const search: Validator = async (env, fetchFn) => {
  const { res, reason } = await call(
    fetchFn,
    'Brave',
    'https://api.search.brave.com/res/v1/web/search?q=agentlings&count=1',
    { accept: 'application/json', 'x-subscription-token': env.BRAVE_API_KEY ?? '' },
  );
  if (!res) return { ok: false, reason };
  if (res.ok) return { ok: true };
  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: 'Brave rejected the key' };
  }
  if (res.status === 429) {
    // Ambiguous on purpose-built free tiers: the key may be fine and the
    // check itself rate-limited. Refusing to store keeps the promise that
    // everything stored was validated; the fix is to wait, not to bypass.
    return { ok: false, reason: 'Brave rate-limited the check — wait a minute and try again' };
  }
  return { ok: false, reason: `Brave answered HTTP ${res.status}` };
};

const whatsappBusiness: Validator = async (env, fetchFn) => {
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID ?? '';
  const { res, reason } = await call(
    fetchFn,
    'Meta',
    `https://graph.facebook.com/v20.0/${phoneNumberId}?fields=display_phone_number`,
    { authorization: `Bearer ${env.WHATSAPP_TOKEN}` },
  );
  if (!res) return { ok: false, reason };
  if (res.ok) {
    const body = (await res.json().catch(() => null)) as { display_phone_number?: string } | null;
    const phone = body?.display_phone_number;
    return { ok: true, ...(phone ? { identity: phone } : {}) };
  }
  if (res.status === 401) return { ok: false, reason: 'Meta rejected the token' };
  if (res.status === 404 || res.status === 400) {
    return { ok: false, reason: 'Meta found no phone number with that id — check both values' };
  }
  return { ok: false, reason: `Meta answered HTTP ${res.status}` };
};

const slack: Validator = async (env, fetchFn) => {
  // Slack answers HTTP 200 with {ok:false} on a bad token — the body is the
  // verdict, same as its send call (D-104).
  const { res, reason } = await call(fetchFn, 'Slack', 'https://slack.com/api/auth.test', {
    authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
  });
  if (!res) return { ok: false, reason };
  if (!res.ok) return { ok: false, reason: `Slack answered HTTP ${res.status}` };
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    user?: string;
    team?: string;
  } | null;
  if (!body?.ok) {
    return {
      ok: false,
      reason:
        body?.error === 'invalid_auth'
          ? 'Slack rejected the token — paste the Bot User OAuth Token (xoxb-…)'
          : `Slack refused: ${body?.error ?? 'no reason given'}`,
    };
  }
  const who = [body.user, body.team].filter(Boolean).join(' in ');
  return { ok: true, ...(who ? { identity: who } : {}) };
};

/** By connection name, deliberately — a validator knows its whole connection. */
export const VALIDATORS: Record<string, Validator> = {
  telegram,
  github,
  search,
  'whatsapp-business': whatsappBusiness,
  slack,
};

export async function validateConnectionSecret(
  connectionName: string,
  env: Env,
  fetchFn: typeof fetch = fetch,
): Promise<Validation> {
  const validator = VALIDATORS[connectionName];
  if (!validator) {
    return {
      ok: false,
      reason: `no validator for "${connectionName}" — set its secret in .env instead`,
    };
  }
  return validator(env, fetchFn);
}
