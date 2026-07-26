import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, 'author'), { recursive: true });

await Promise.all([
  cp(resolve(root, 'index.html'), resolve(dist, 'index.html')),
  cp(resolve(root, 'catalog-config.json'), resolve(dist, 'catalog-config.json')),
  cp(resolve(root, 'author/index.html'), resolve(dist, 'author/index.html'))
]);

const config = JSON.parse(await readFile(resolve(dist, 'catalog-config.json'), 'utf8'));
await writeFile(
  resolve(dist, 'build-info.json'),
  JSON.stringify({
    builtAt: new Date().toISOString(),
    catalogUpdatedAt: config.updatedAt ?? null
  })
);

console.log('Built dist with public gallery assets only.');
