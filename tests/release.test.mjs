import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createManifest } from '../scripts/release-manifest.mjs';
const signature = Buffer.from('signed fixture').toString('base64');
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'buildbench-release-'));
  for (const name of ['BuildBench.app.tar.gz', 'BuildBench_0.1.1_x64-setup.exe']) {
    writeFileSync(join(dir, name), 'installer fixture');
    writeFileSync(join(dir, name + '.sig'), signature);
  }
  return dir;
}
test('manifest routes each supported OS to the matching immutable signed artifact', () => {
  const dir = fixture();
  try {
    const manifest = createManifest('0.1.1', dir);
    assert.equal(manifest.version, '0.1.1');
    assert.deepEqual(Object.keys(manifest.platforms).sort(), ['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64']);
    assert.match(manifest.platforms['windows-x86_64'].url, /\/v0.1.1\/BuildBench_0.1.1_x64-setup.exe$/);
    assert.deepEqual(manifest.platforms['darwin-x86_64'], manifest.platforms['darwin-aarch64']);
    assert.equal(manifest.platforms['darwin-aarch64'].signature, signature);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('publication refuses missing signatures, empty installers and invalid versions', () => {
  const dir = fixture();
  try {
    assert.throws(() => createManifest('../latest', dir));
    writeFileSync(join(dir, 'BuildBench.app.tar.gz.sig'), '');
    assert.throws(() => createManifest('0.1.1', dir), /Invalid updater signature/);
    writeFileSync(join(dir, 'BuildBench.app.tar.gz.sig'), signature);
    writeFileSync(join(dir, 'BuildBench.app.tar.gz'), '');
    assert.throws(() => createManifest('0.1.1', dir), /Empty installer/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
