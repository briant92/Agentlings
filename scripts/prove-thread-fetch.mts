// The counterparty thread's IN half, proven live and read-only (#43, D-286).
//
//   npx tsx scripts/prove-thread-fetch.mts [gmail query]     (from the repo root)
//
// Reads the operator's own mailbox through the app's own Google consent
// exactly as a trigger firing does since D-286: the newest mail matching the
// query (default: anything with an attachment from the last 30 days, never
// the operator's own sends), its attachments fetched under the desk caps, its
// conversation so far. **Nothing is written to disk, nothing is queued,
// nothing is sent.** The OUT half — a reply carrying a file into the thread —
// is a send, and only Approve on a real job proves it; this script says so at
// the end rather than letting 0 failures read as "proven end to end".
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOOGLE_SECRETS, accessTokenFromRefresh } from '../server/src/google.ts';
import type { Http } from '../server/src/library.ts';
import { fetchThread, fetchTriggerMail, human, listMailIds } from '../server/src/mail.ts';
import { gatherFiring } from '../server/src/mailtrigger.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  // No .env — the consent check below says so.
}
const query = process.argv[2] ?? 'has:attachment newer_than:30d';

let bad = 0;
let ran = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  ran++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail === undefined ? '' : `  — ${detail}`}`);
  if (!ok) bad++;
};

const clientId = process.env[GOOGLE_SECRETS.clientId];
const clientSecret = process.env[GOOGLE_SECRETS.clientSecret];
const refreshToken = process.env[GOOGLE_SECRETS.refreshToken];
check('§0 Google is connected in .env', Boolean(clientId && clientSecret && refreshToken));

if (clientId && clientSecret && refreshToken) {
  const http: Http = (url, headers, init) => fetch(url, { headers, ...init });
  const access = await accessTokenFromRefresh({ clientId, clientSecret, refreshToken });
  check('§1 a short-lived token minted from the stored consent', !('error' in access), 'error' in access ? access.error : undefined);
  if (!('error' in access)) {
    const token = access.token;
    const listed = await listMailIds(http, token, `${query} -from:me`, 1);
    const id = 'ids' in listed ? listed.ids[0] : undefined;
    check(`§2 Gmail lists a match for "${query}"`, Boolean(id), 'error' in listed ? listed.error : id);
    if (id) {
      const mail = await fetchTriggerMail(http, token, id);
      check('§3 the mail renders as a firing sees it', !('error' in mail), 'error' in mail ? mail.error : undefined);
      if (!('error' in mail)) {
        console.log(`      from: ${mail.from}`);
        console.log(`      subject: ${mail.subject}`);
        console.log(
          `      attachments named: ${mail.attachments.length}${mail.attachments.length ? ' — ' + mail.attachments.map((a) => `${a.name} (${human(a.size)}${a.attachmentId ? ', by id' : ', inline'})`).join(', ') : ''}`,
        );
        check('§3b the firing text carries no "never fetched" line', !mail.text.includes('never fetched'));
        const firing = await gatherFiring(http, token, mail);
        const foot = firing.text.slice(mail.text.length).trim();
        console.log(`      foot of mail.txt:\n${foot.split('\n').map((l) => `        ${l}`).join('\n') || '        (nothing to add)'}`);
        const accounted = firing.files.length + (foot.match(/^Attachment .* — (left behind|could not be fetched)/gm) ?? []).length;
        check(
          '§4 every named attachment is either beside the mail or said to be left behind',
          accounted === mail.attachments.length,
          `${firing.files.length} fetched — ${firing.files.map((f) => `${f.name} (${human(f.data.length)})`).join(', ') || 'none'}`,
        );
        for (const f of firing.files) {
          check(`§4b ${f.name} has real bytes under the cap`, f.data.length > 0 && f.data.length <= 10 * 1024 * 1024, human(f.data.length));
        }
        const thread = await fetchThread(http, token, mail.threadId);
        check('§5 the conversation reads whole', !('error' in thread), 'error' in thread ? thread.error : `${thread.count} message(s)`);
        if (!('error' in thread)) {
          check(
            '§5b thread.txt rides exactly when the mail was not the first message',
            (thread.count > 1) === (firing.thread !== undefined),
            thread.count > 1 ? `${(firing.thread ?? '').split('———— message ').length - 1} numbered messages in thread.txt` : 'one message, no thread.txt',
          );
        }
      }
    }
  }
}

console.log(`\n${bad === 0 ? 'PASS' : 'FAIL'}  ${ran - bad}/${ran}  — read-only: nothing written, queued or sent`);
console.log(
  'Not proven here: a reply carrying a file INTO this thread. That is a send, and Approve on a real job is the only proof (#43, D-286).',
);
process.exitCode = bad === 0 ? 0 : 1;
