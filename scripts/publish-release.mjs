import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createManifest } from './release-manifest.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const repo = 'george4real67/buildbench-desktop';
const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const version = config.version;
const tag = `v${version}`;
const keyPath = process.env.BUILDBENCH_UPDATER_KEY || resolve('.release-keys/buildbench-updater.key');
if (!existsSync(keyPath)) throw new Error('Updater signing key missing. Restore your private backup or set BUILDBENCH_UPDATER_KEY.');
const signingEnv = { ...process.env, TAURI_SIGNING_PRIVATE_KEY: keyPath, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD || '' };
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', stdio: options.capture ? 'pipe' : 'inherit', env: options.sign ? signingEnv : process.env, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr || ''}`);
  return (result.stdout || '').trim();
}
const tauri = args => run(process.execPath, [resolve('node_modules/@tauri-apps/cli/tauri.js'), ...args], { sign: true });
const sha = run('git', ['rev-parse', 'HEAD'], { capture: true });
if (run('git', ['status', '--porcelain', '--untracked-files=no'], { capture: true })) throw new Error('Commit tracked source changes before publishing.');
const remoteSha = run('git', ['ls-remote', 'origin', 'refs/heads/master'], { capture: true }).split(/\s/)[0];
if (sha !== remoteSha) throw new Error('Push the current commit to master before publishing.');
const started = Date.now() - 5000;
run('gh', ['workflow', 'run', 'macos-release.yml', '--repo', repo, '--ref', 'master']);
console.log('Building signed Windows installers while GitHub builds the universal Mac app...');
run(process.execPath, ['--test', 'tests/security.test.mjs', 'tests/release.test.mjs']);
tauri(['build', '--bundles', 'nsis,msi']);
let runId;
for (let attempt = 0; attempt < 180; attempt++) {
  const runs = JSON.parse(run('gh', ['run', 'list', '--repo', repo, '--workflow', 'macos-release.yml', '--limit', '20', '--json', 'databaseId,headSha,createdAt,status,conclusion'], { capture: true }));
  const current = runs.find(item => item.headSha === sha && Date.parse(item.createdAt) >= started);
  if (current) {
    runId = current.databaseId;
    if (current.status === 'completed') {
      if (current.conclusion !== 'success') throw new Error(`Mac build failed: https://github.com/${repo}/actions/runs/${runId}`);
      break;
    }
  }
  console.log('Waiting for Mac installer verification...');
  await new Promise(resolve => setTimeout(resolve, 15000));
  if (attempt === 179) throw new Error('Mac build timed out; no release published.');
}
const output = resolve(`src-tauri/target/release/publication-${version}`);
mkdirSync(output, { recursive: true });
const macDir = join(output, 'mac');
run('gh', ['run', 'download', String(runId), '--repo', repo, '--name', 'BuildBench-macOS-universal', '--dir', macDir]);
function find(dir, name) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return path;
    if (entry.isDirectory()) { const found = find(path, name); if (found) return found; }
  }
}
for (const name of [`BuildBench_${version}_universal.dmg`, 'BuildBench.app.tar.gz']) {
  const path = find(macDir, name);
  if (!path) throw new Error(`Missing Mac artifact: ${name}`);
  copyFileSync(path, join(output, name));
}
for (const [kind, name] of [['nsis', `BuildBench_${version}_x64-setup.exe`], ['msi', `BuildBench_${version}_x64_en-US.msi`]]) {
  for (const suffix of ['', '.sig']) copyFileSync(`src-tauri/target/release/bundle/${kind}/${name}${suffix}`, join(output, name + suffix));
}
const signerEnv = { ...process.env };
delete signerEnv.TAURI_SIGNING_PRIVATE_KEY;
run(process.execPath, [resolve('node_modules/@tauri-apps/cli/tauri.js'), 'signer', 'sign', '--private-key-path', keyPath, '--app-version', version, join(output, 'BuildBench.app.tar.gz')], { env: signerEnv });
const manifest = createManifest(version, output);
writeFileSync(join(output, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
run('cargo', ['run', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', '--example', 'verify_release', '--', output]);
writeFileSync(join(output, 'notes.local'), `BuildBench ${version}\n\nPersistent top-right Update control and signed in-app updates for Windows and Mac.\n`);
// Prepare all assets before making the new release visible to installed apps.
const existing = spawnSync('gh', ['release', 'view', tag, '--repo', repo, '--json', 'isDraft'], { encoding: 'utf8' });
if (existing.status === 0) {
  if (!JSON.parse(existing.stdout).isDraft) throw new Error('This version is already published. Bump the version before publishing again.');
} else {
  run('gh', ['release', 'create', tag, '--repo', repo, '--target', sha, '--draft', '--title', `BuildBench ${version}`, '--notes-file', join(output, 'notes.local')]);
}
const assets = readdirSync(output).filter(name => /\.(exe|msi|dmg|gz|sig|json)$/.test(name)).map(name => join(output, name));
run('gh', ['release', 'upload', tag, '--repo', repo, '--clobber', ...assets]);
run('gh', ['release', 'edit', tag, '--repo', repo, '--draft=false', '--latest']);
// Keep existing download-site links working, without storing the signing key in CI.
const aliases = [
  [`BuildBench_${version}_x64-setup.exe`, 'BuildBench_0.1.0_x64-setup.exe'],
  [`BuildBench_${version}_x64_en-US.msi`, 'BuildBench_0.1.0_x64_en-US.msi'],
  [`BuildBench_${version}_universal.dmg`, 'BuildBench_0.1.0_universal.dmg'],
];
const aliasDir = join(output, 'download-site');
mkdirSync(aliasDir, { recursive: true });
for (const [source, alias] of aliases) copyFileSync(join(output, source), join(aliasDir, alias));
run('gh', ['release', 'upload', 'v0.1.0', '--repo', repo, '--clobber', ...aliases.map(([, name]) => join(aliasDir, name))]);
console.log(`Published and connected to existing downloads: https://github.com/${repo}/releases/tag/${tag}`);
