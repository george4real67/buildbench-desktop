import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function createManifest(version, directory) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('A stable semantic version is required');
  const entry = name => {
    if (statSync(join(directory, name)).size === 0) throw new Error(`Empty installer: ${name}`);
    const signature = readFileSync(join(directory, name + '.sig'), 'utf8').trim();
    if (!signature || !/^[A-Za-z0-9+/=]+$/.test(signature)) throw new Error(`Invalid updater signature: ${name}`);
    return { url: `https://github.com/george4real67/buildbench-desktop/releases/download/v${version}/${name}`, signature };
  };
  const mac = entry('BuildBench.app.tar.gz');
  return {
    version, notes: `BuildBench ${version}`, pub_date: new Date().toISOString(),
    platforms: {
      'windows-x86_64': entry(`BuildBench_${version}_x64-setup.exe`),
      'darwin-aarch64': mac,
      'darwin-x86_64': mac,
    },
  };
}
