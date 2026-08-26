/**
 * A throwaway SII-shaped certificate, for tests and for the live proof.
 *
 * Both `sii.test.ts` and `scripts/prove-sii-door.mts` need a real `.p12` that
 * really opens with a real password — the test so its refusals are measured
 * against OpenSSL rather than guessed, the proof so the adapter has something
 * to start with. They wrote the same fifteen lines twice; D-030's rule says
 * the second copy is the mistake, so this is the one of them.
 *
 * **The SII has never seen this certificate and never will take it** — it is
 * self-signed, so the real SII closes the connection with `unknown ca`, which
 * is precisely what the proof measures. Nothing here is a credential: the
 * password is a constant in this file, and the file is written to a fresh
 * temp folder each time.
 *
 * Not a `.test.ts` file, because the proof script imports it too and the proof
 * is not run by vitest.
 */
import forge from 'node-forge';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** The password the throwaway certificate opens with. Not a secret; it guards nothing. */
export const THROWAWAY_CERT_PASSWORD = 'la-clave-del-certificado';

/**
 * Writes a fresh self-signed `.p12` to a new temp folder and returns its path.
 *
 * 2048-bit RSA and `3des` rather than the PKCS#12 defaults: OpenSSL 3 refuses
 * the legacy RC2 encryption older tools produce, and Node's reader is OpenSSL,
 * so a certificate made any other way would fail to open here for a reason
 * that has nothing to do with what is being tested.
 */
export function makeThrowawayCertificate(password: string = THROWAWAY_CERT_PASSWORD): string {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.UTC(2026, 0, 1));
  cert.validity.notAfter = new Date(Date.UTC(2027, 0, 1));
  const who = [{ name: 'commonName', value: 'PRUEBA AGENTLINGS' }];
  cert.setSubject(who);
  cert.setIssuer(who);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: '3des' });
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'sii-throwaway-')), 'throwaway.p12');
  writeFileSync(file, Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary'));
  return file;
}
