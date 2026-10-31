import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertAll, loadSources, CONVERTER_ROOT } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureSources = {
  sourceDir: join(here, 'fixtures'),
  files: {
    NRT: 'fixture-dark.json',
    'NRT-Bright': 'fixture-dark.json',
    'NRT-Italic': 'fixture-dark.json',
    'NRT-Bright-Italic': 'fixture-dark.json',
    'NRT-Light': 'fixture-light.json',
  },
};
const hashAll = (files) => createHash('sha256').update(JSON.stringify(Object.entries(files).sort())).digest('hex');

test('determinism: two runs produce identical output (fixtures, real mappings)', () => {
  const a = convertAll(fixtureSources).files;
  const b = convertAll(fixtureSources).files;
  assert.equal(Object.keys(a).length, 10);
  assert.equal(hashAll(a), hashAll(b));
  for (const content of Object.values(a)) {
    assert.ok(!content.includes('\r'), 'LF line endings only');
    assert.ok(content.endsWith('\n'));
  }
});

const hasSources = existsSync(join(CONVERTER_ROOT, 'sources.local.json'));

test('snapshot: real sources match test/__snapshots__ (update with npm run snapshots:update)', { skip: !hasSources && 'sources.local.json not found' }, () => {
  const sources = loadSources();
  if (!existsSync(sources.sourceDir)) return;
  const { files } = convertAll(sources);
  const snapDir = join(here, '__snapshots__');
  const snaps = existsSync(snapDir) ? readdirSync(snapDir) : [];
  assert.deepEqual(snaps.sort(), Object.keys(files).sort(), 'snapshot file set');
  for (const [name, content] of Object.entries(files)) {
    assert.equal(content, readFileSync(join(snapDir, name), 'utf8'), `snapshot ${name}`);
  }
  assert.equal(hashAll(files), hashAll(convertAll(sources).files), 'deterministic on real sources');
});

test('generated themes committed in src/main/resources/themes are up to date', { skip: !hasSources && 'sources.local.json not found' }, () => {
  const sources = loadSources();
  if (!existsSync(sources.sourceDir)) return;
  const { files } = convertAll(sources);
  const outDir = join(CONVERTER_ROOT, '..', 'src', 'main', 'resources', 'themes');
  for (const [name, content] of Object.entries(files)) {
    assert.equal(readFileSync(join(outDir, name), 'utf8'), content, `${name} is stale: run npm run build`);
  }
});
