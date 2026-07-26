import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const files = ['index.html', 'author/index.html'];
const hashes = [];

for (const file of files) {
  const html = await readFile(resolve(root, file), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];
  if (scripts.length !== 1) throw new Error(`${file}: expected exactly one inline script`);

  hashes.push(
    `'sha256-${createHash('sha256').update(scripts[0][1]).digest('base64')}'`
  );
}

const netlify = await readFile(resolve(root, 'netlify.toml'), 'utf8');
for (const hash of hashes) {
  if (!netlify.includes(hash)) throw new Error(`CSP is missing ${hash}`);
}

const config = JSON.parse(await readFile(resolve(root, 'catalog-config.json'), 'utf8'));
if (!config.sectionById || !config.orderBySection) {
  throw new Error('catalog-config.json has an invalid shape');
}

console.log('Static checks passed.');
