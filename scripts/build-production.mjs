import { cp, mkdtemp, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stagingRoot = await mkdtemp(path.join(os.tmpdir(), 'wrap-roll-build-'));
const excluded = new Set(['.git', 'dist', '.node', 'node_modules']);

try {
  await cp(projectRoot, stagingRoot, {
    recursive: true,
    filter: (source) => !excluded.has(path.basename(source)),
  });
  await symlink(path.join(projectRoot, 'node_modules'), path.join(stagingRoot, 'node_modules'), 'junction');

  const viteCli = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  const result = spawnSync(process.execPath, [viteCli, 'build'], {
    cwd: stagingRoot,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) process.exit(result.status ?? 1);

  await rm(path.join(projectRoot, 'dist'), { recursive: true, force: true });
  await cp(path.join(stagingRoot, 'dist'), path.join(projectRoot, 'dist'), { recursive: true });
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}