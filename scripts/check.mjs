import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Script } from 'node:vm';

const root = resolve(new URL('..', import.meta.url).pathname);
const files = ['index.html', 'author/index.html'];
const hashes = [];

for (const file of files) {
  const html = await readFile(resolve(root, file), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)];
  if (scripts.length !== 1) throw new Error(`${file}: expected exactly one inline script`);
  new Script(scripts[0][1], { filename: file });

  hashes.push(
    `'sha256-${createHash('sha256').update(scripts[0][1]).digest('base64')}'`
  );
}

const netlify = await readFile(resolve(root, 'netlify.toml'), 'utf8');
for (const hash of hashes) {
  if (!netlify.includes(hash)) throw new Error(`CSP is missing ${hash}`);
}

const authorHtml = await readFile(resolve(root, 'author/index.html'), 'utf8');
if (!authorHtml.includes("const AUTHOR_REDIRECT_URL = 'https://www.slavaushakov.gallery/author/';")) {
  throw new Error('author/index.html is missing the canonical production Auth redirect');
}
if (/localhost(?::\d+)?/i.test(authorHtml)) {
  throw new Error('author/index.html must not contain a localhost Auth redirect');
}

const config = JSON.parse(await readFile(resolve(root, 'catalog-config.json'), 'utf8'));
if (
  config.catalogSchemaVersion !== 2 ||
  !config.sectionById ||
  !config.orderBySection ||
  !config.titleById ||
  !config.hiddenById ||
  !Array.isArray(config.excludedPaintingIds) ||
  !Array.isArray(config.featuredPaintingIds) ||
  !Array.isArray(config.appliedMigrations)
) {
  throw new Error('catalog-config.json has an invalid shape');
}

const indexHtml = await readFile(resolve(root, 'index.html'), 'utf8');
const embeddedMatch = indexHtml.match(/^const DEFAULT_CATALOG_CONFIG = (.*);$/m);
if (!embeddedMatch || JSON.stringify(JSON.parse(embeddedMatch[1])) !== JSON.stringify(config)) {
  throw new Error('Embedded catalogue fallback does not match catalog-config.json');
}

const legacyConstants = [
  'MYTHOLOGY_PAINTING_IDS',
  'AVIATION_PAINTING_IDS',
  'ANIMATION_PAINTING_IDS',
  'FEATURED_PAINTING_IDS',
  'EXCLUDED_DUPLICATE_PAINTING_IDS',
  'REPLACED_PAINTING_IDS',
  'RESTORED_PAINTING_IDS',
  'PAINTING_TITLE_OVERRIDES'
];
if (legacyConstants.some(name => indexHtml.includes(name))) {
  throw new Error('Legacy hard-coded catalogue metadata is still present in index.html');
}

console.log('Static checks passed.');
