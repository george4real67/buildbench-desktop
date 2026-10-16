import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const config = JSON.parse(read('src-tauri/tauri.conf.json'));

test('production opens the bundled welcome screen without a global native API', () => {
  assert.equal(config.app.withGlobalTauri, false);
  assert.equal(config.app.windows.length, 1);
  assert.equal(config.app.windows[0].url, 'index.html');
  assert.equal(config.app.windows[0].devtools, false);
});

test('only the explicitly selected zero-permission capability is enabled', () => {
  assert.deepEqual(config.app.security.capabilities, ['default']);
  const capability = JSON.parse(read('src-tauri/capabilities/default.json'));
  assert.equal(capability.identifier, 'default');
  assert.deepEqual(capability.permissions, []);
  assert.equal(capability.remote, undefined);
  assert.deepEqual(readdirSync(new URL('../src-tauri/capabilities', import.meta.url)), ['default.json']);
});

test('bundled welcome screen has a restrictive CSP and no inline executable content', () => {
  const csp = config.app.security.csp;
  for (const directive of ["default-src 'self'", "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
    assert.ok(csp.split(';').map(value => value.trim()).includes(directive));
  }
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/);
  assert.doesNotMatch(read('index.html'), /<script|\son\w+\s*=|javascript:/i);
});

test('wrapper does not register native commands or plugins', () => {
  assert.doesNotMatch(read('src-tauri/src/lib.rs'), /#\[tauri::command\]|\.invoke_handler\s*\(|\.plugin\s*\(/);
  assert.doesNotMatch(read('src-tauri/Cargo.toml'), /^tauri-plugin-/m);
  assert.doesNotMatch(read('src/main.ts'), /@tauri-apps|invoke\(/);
});
