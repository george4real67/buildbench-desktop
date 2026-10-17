import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const config = JSON.parse(read('src-tauri/tauri.conf.json'));

test('desktop routing stays inside authentication and tools without touching other origins or local actions', () => {
  const script = read('src-tauri/src/lib.rs').match(/const DESKTOP_INIT: &str = r#"([\s\S]*?)"#;/)[1];
  function boot(pathname = '/', hash = '#/login', origin = 'https://buildbench.online', frame = false) {
    const redirects = [], handlers = {}, navigations = [];
    const location = { pathname, hash, origin, href: origin + pathname + hash, replace: value => redirects.push(value) };
    const window = { addEventListener: (name, fn) => handlers[name] = fn, __bizAppBridge: { navigate: path => navigations.push(path) } };
    window.top = frame ? {} : window;
    const document = { addEventListener: (name, fn) => handlers[name] = fn };
    runInNewContext(script, { window, location, document, URL, MutationObserver: class { observe() {} } });
    return { redirects, handlers, navigations, location };
  }
  assert.deepEqual(boot('/', '').redirects, ['/#/dashboard']);
  assert.deepEqual(boot('/how-it-works', '').redirects, ['/#/dashboard']);
  assert.deepEqual(boot('/pricing', '').redirects, ['/#/credits']);
  for (const route of ['login', 'signup', 'verify-email', 'dashboard', 'templates', 'business/invite']) assert.deepEqual(boot('/', '#/' + route).redirects, []);
  assert.deepEqual(Object.keys(boot('/', '', 'https://accounts.google.com').handlers), []);
  assert.deepEqual(Object.keys(boot('/', '', 'https://buildbench.online', true).handlers), []);
  const app = boot();
  function click(href, extra = {}) {
    const event = { button: 0, target: { closest: () => ({ href: new URL(href, app.location.href).href, getAttribute: () => href, hasAttribute: () => false }) }, preventDefault() { this.prevented = true; }, stopImmediatePropagation() {}, ...extra };
    app.handlers.click(event);
    return event.prevented;
  }
  assert.equal(click('/'), true);
  assert.equal(app.navigations.at(-1), '/dashboard');
  assert.equal(click('/pricing'), true);
  assert.equal(app.navigations.at(-1), '/credits');
  for (const href of ['#', '#forgot-password', '/signup', '/verify-email', 'https://legal.buildbench.online/']) assert.equal(click(href), undefined);
  assert.equal(click('/', { ctrlKey: true }), undefined);
  app.location.hash = '#/';
  app.handlers.hashchange({ stopImmediatePropagation() {} });
  assert.equal(app.redirects.at(-1), '/#' + '/dashboard');
});
test('native shell starts at authentication and keeps the toolbar local without a global API', () => {
  assert.equal(config.app.withGlobalTauri, false);
  assert.equal(config.app.windows[0].create, false);
  assert.equal(config.app.windows[0].devtools, false);
  assert.match(read('src-tauri/src/lib.rs'), /WebviewUrl::App\("toolbar.html"/);
  assert.match(read('src-tauri/src/lib.rs'), /APP_START_URL: &str = "https:\/\/buildbench.online\/#\/login"/);
  assert.match(read('src-tauri/src/lib.rs'), /WebviewUrl::External\(APP_START_URL.parse\(\)\?\)/);
  assert.match(read('src-tauri/src/lib.rs'), /\.initialization_script\(DESKTOP_INIT\)/);
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
