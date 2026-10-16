import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const config = JSON.parse(read('src-tauri/tauri.conf.json'));
test('native shell creates local welcome and persistent toolbar without a global API', () => {
  assert.equal(config.app.withGlobalTauri, false);
  assert.equal(config.app.windows[0].create, false);
  assert.equal(config.app.windows[0].devtools, false);
  assert.match(read('src-tauri/src/lib.rs'), /WebviewUrl::App\("toolbar.html"/);
});
test('web content receives no native capabilities, including updater and dialogs', () => {
  assert.deepEqual(config.app.security.capabilities, ['default']);
  const capability = JSON.parse(read('src-tauri/capabilities/default.json'));
  assert.deepEqual(capability.permissions, []);
  assert.equal(capability.remote, undefined);
  assert.deepEqual(readdirSync(new URL('../src-tauri/capabilities', import.meta.url)), ['default.json']);
  assert.doesNotMatch(read('src-tauri/src/lib.rs'), /#\[tauri::command\]|\.invoke_handler\s*\(/);
});
test('local pages keep restrictive CSP and no executable content', () => {
  for (const directive of ["default-src 'self'", "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
    assert.ok(config.app.security.csp.split(';').map(value => value.trim()).includes(directive));
  }
  assert.doesNotMatch(config.app.security.csp, /unsafe-inline|unsafe-eval|\*/);
  for (const page of ['index.html', 'toolbar.html']) assert.doesNotMatch(read(page), /<script|\son\w+\s*=|javascript:/i);
});
test('updates require signed artifacts from the fixed HTTPS release endpoint', () => {
  assert.equal(config.bundle.createUpdaterArtifacts, true);
  assert.deepEqual(config.plugins.updater.endpoints, ['https://github.com/george4real67/buildbench-desktop/releases/latest/download/latest.json']);
  assert.ok(Buffer.from(config.plugins.updater.pubkey, 'base64').toString().startsWith('untrusted comment: minisign public key:'));
  assert.notEqual(config.plugins.updater.dangerousInsecureTransportProtocol, true);
  assert.match(read('toolbar.html'), /href="https:\/\/buildbench.invalid\/check-for-updates"/);
});
