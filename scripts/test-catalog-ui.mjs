import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const html = await readFile(resolve(new URL('..', import.meta.url).pathname, 'index.html'), 'utf8');
const between = (start, end) => {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Could not find ${start}`);
  return html.slice(from, to);
};

const context = {
  TECH_GROUPS: [{ key: 'живопись' }, { key: 'графика' }],
  MAX_FEATURED_PAINTINGS: 6,
  allPaintings: [],
  sourcePaintings: [],
  currentSort: 'default',
  techLabel: key => key,
  catalogConfigFingerprint: config => JSON.stringify(config),
  syncSectionOrder: key => context.catalogConfig.orderBySection[key]
};
runInNewContext([
  between('function createEmptyCatalogConfig()', 'function cloneCatalogConfig('),
  between('function applyCatalogConfigToPaintings()', 'function sanitizeFeaturedPaintingIds('),
  between('function sortSectionItems(', 'function setAdminStatus('),
  between('function changedMapIds(', 'function formatReviewArtworkNames('),
  'globalThis.testFunctions = { createEmptyCatalogConfig, normalizeCatalogConfig, applyCatalogConfigToPaintings, sortSectionItems, buildCatalogChangeSummary };'
].join('\n'), context);

const { createEmptyCatalogConfig, normalizeCatalogConfig, applyCatalogConfigToPaintings, sortSectionItems, buildCatalogChangeSummary } = context.testFunctions;
context.catalogConfig = normalizeCatalogConfig(createEmptyCatalogConfig());
const sourcePainting = id => ({
  id, source_title: `Artwork ${id}`, source_flag_hidden: false, source_price: 100,
  source_in_stock: true, source_year: 2026, source_width_cm: 20, source_height_cm: 30,
  source_material: 'Canvas', source_image_url: `public/${id}.jpg`
});
context.sourcePaintings = [sourcePainting(1), sourcePainting(2)];
context.catalogConfig.excludedPaintingIds = [2];
applyCatalogConfigToPaintings();
assert.deepEqual(Array.from(context.allPaintings, item => item.id), [1]);
context.catalogConfig.excludedPaintingIds = [];
applyCatalogConfigToPaintings();
assert.deepEqual(Array.from(context.allPaintings, item => item.id), [1, 2]);

context.catalogConfig.orderBySection['живопись'] = [1, 2, 3];
const paintings = [
  { id: 1, created_at: '2020-01-01T00:00:00Z', source_flag_hidden: false, source_in_stock: true },
  { id: 2, created_at: '2023-01-01T00:00:00Z', source_flag_hidden: true, source_in_stock: true },
  { id: 3, created_at: '2021-01-01T00:00:00Z', source_flag_hidden: false, source_in_stock: true }
];
context.allPaintings = paintings;
assert.deepEqual(Array.from(sortSectionItems(paintings, 'живопись'), item => item.id), [2, 3, 1]);
context.catalogConfig.publishedAtById['1'] = '2024-01-01T00:00:00.000Z';
assert.deepEqual(Array.from(sortSectionItems(paintings, 'живопись'), item => item.id), [1, 2, 3]);
context.currentSort = 'manual';
assert.deepEqual(Array.from(sortSectionItems(paintings, 'живопись'), item => item.id), [1, 2, 3]);
context.currentSort = 'default';

const before = normalizeCatalogConfig(createEmptyCatalogConfig());
const after = normalizeCatalogConfig(before);
after.hiddenById['1'] = true;
after.hiddenById['2'] = false;
after.draftPaintingIds = [];
before.draftPaintingIds = [2];
after.stockById['3'] = false;
context.publishedCatalogConfig = before;
context.catalogConfig = after;
const summary = buildCatalogChangeSummary();
const idsFor = key => Array.from(summary.find(item => item.labelKey === key)?.ids || []);
assert.deepEqual(idsFor('review.archived'), [1]);
assert.deepEqual(idsFor('review.publishedDraft'), [2]);
assert.deepEqual(idsFor('review.markedSold'), [3]);

const backupContext = { crypto: webcrypto, TextEncoder };
runInNewContext([
  between('async function catalogSnapshotChecksum(', 'function closeCatalogHistoryDialog('),
  'globalThis.backupFunctions = { buildCatalogBackup, verifyCatalogBackup };'
].join('\n'), backupContext);
const backupConfig = normalizeCatalogConfig(createEmptyCatalogConfig());
backupConfig.hiddenById['2'] = true;
const backup = await backupContext.backupFunctions.buildCatalogBackup(
  { config: backupConfig, updated_at: '2026-09-19T10:00:00Z' },
  [{ id: 1, image_url: 'public/1.jpg' }, { id: 2, flag_hidden: true }],
  '2026-09-19T10:01:00Z'
);
assert.equal(backup.artworkCount, 2);
assert.equal(backup.imagesIncluded, false);
assert.equal(backup.snapshot.paintings[1].id, 2);
assert.equal(
  backup.checksum.value,
  createHash('sha256').update(JSON.stringify(backup.snapshot)).digest('hex')
);
assert.equal(
  await backupContext.backupFunctions.verifyCatalogBackup(backup, backup.snapshot.paintings),
  backup.snapshot.catalogConfig
);
await assert.rejects(
  backupContext.backupFunctions.verifyCatalogBackup(
    { ...backup, checksum: { ...backup.checksum, value: '0'.repeat(64) } },
    backup.snapshot.paintings
  ), /checksum/
);
await assert.rejects(
  backupContext.backupFunctions.verifyCatalogBackup(backup, [
    backup.snapshot.paintings[0], { ...backup.snapshot.paintings[1], flag_hidden: false }
  ]), /paintings-changed/
);
await assert.rejects(
  backupContext.backupFunctions.verifyCatalogBackup(backup, [
    { ...backup.snapshot.paintings[0], new_database_field: 'changed' }, backup.snapshot.paintings[1]
  ]), /paintings-changed/
);

console.log('Catalogue UI behavior tests passed.');
