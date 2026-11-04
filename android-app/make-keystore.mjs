#!/usr/bin/env node
// Creates the release signing key for the Android app (a PKCS#12 keystore),
// once. Android only installs an update if it is signed with the same key as the
// installed app, so this key must be kept safe and never regenerated.
//
//   cd android-app && npm run keystore
//
// Writes, into android-app/signing/ (git-ignored):
//   breviary-release.p12   the keystore
//   signing-info.txt       its alias and password
// Refuses to overwrite an existing keystore.

import forge from 'node-forge';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'signing');
const KS = join(DIR, 'breviary-release.p12');
const ALIAS = 'breviary';

if (existsSync(KS)) {
  console.error(`A keystore already exists at ${KS}. Not overwriting it.`);
  process.exit(1);
}

const password = randomBytes(24).toString('base64url');
console.log('Generating a 3072-bit RSA key (takes a few seconds)...');
const keys = forge.pki.rsa.generateKeyPair({ bits: 3072, e: 0x10001 });
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = '01' + randomBytes(8).toString('hex');
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 40);
const attrs = [{ name: 'commonName', value: 'Breviary' }, { name: 'organizationName', value: 'Breviary App' }];
cert.setSubject(attrs);
cert.setIssuer(attrs);
cert.sign(keys.privateKey, forge.md.sha256.create());

const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
  algorithm: '3des',
  friendlyName: ALIAS,
  generateLocalKeyId: true,
});
await mkdir(DIR, { recursive: true });
await writeFile(KS, Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary'));
await writeFile(join(DIR, 'signing-info.txt'), [
  'Breviary Android release signing key',
  '====================================',
  `Created: ${new Date().toISOString()}`,
  `Keystore file: breviary-release.p12 (PKCS#12)`,
  `Key alias: ${ALIAS}`,
  `Password (keystore and key): ${password}`,
  '',
  'KEEP THIS FOLDER SAFE AND BACKED UP (e.g. in a password manager).',
  'Without this exact key, future versions of the app cannot be installed',
  'over the existing one; everyone would have to uninstall and reinstall.',
  'Never commit it to git. A copy is stored as GitHub Actions secrets.',
  '',
].join('\n'));
console.log(`Keystore written to ${KS}`);
console.log('Alias and password are in signing/signing-info.txt');
