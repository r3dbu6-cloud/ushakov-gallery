import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const url = html.match(/const SUPABASE_URL = '([^']+)'/)?.[1];
const key = html.match(/const SUPABASE_KEY = '([^']+)'/)?.[1];

if (!url || !key) throw new Error('Supabase public configuration not found');

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json'
};

const checks = [
  {
    name: 'public paintings read',
    request: () => fetch(`${url}/rest/v1/paintings?select=id&limit=1`, { headers }),
    expected: [200]
  },
  {
    name: 'public catalogue config read',
    request: () => fetch(`${url}/rest/v1/catalog_config?select=id&limit=1`, { headers }),
    expected: [200]
  },
  {
    name: 'anonymous orders read blocked',
    request: () => fetch(`${url}/rest/v1/orders?select=id&limit=1`, { headers }),
    expected: [401, 403]
  },
  {
    name: 'anonymous paintings update blocked',
    request: () => fetch(`${url}/rest/v1/paintings?id=eq.-1`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ flag_hidden: false })
    }),
    expected: [401, 403]
  }
];

for (const check of checks) {
  const response = await check.request();
  if (!check.expected.includes(response.status)) {
    const detail = await response.text();
    throw new Error(`${check.name}: HTTP ${response.status} ${detail}`);
  }
  console.log(`${check.name}: HTTP ${response.status}`);
}

console.log('RLS checks passed.');
