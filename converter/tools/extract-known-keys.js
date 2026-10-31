#!/usr/bin/env node
// Extracts the key names an IntelliJ Platform IDE actually knows, so the converter can warn
// about invented keys (a key with a wrong name is silently ignored by the IDE).
//
// Usage: node tools/extract-known-keys.js <ide-install-dir>
//   <ide-install-dir> is an unpacked IDE (e.g. the one Gradle downloads for runIde; look for
//   "idea-<version>-win" under ~/.gradle/caches/<gradle-version>/transforms).
//
// Output: reference/known-ui-keys.json and reference/known-editor-keys.json
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZip } from './zip.js';
import { parseJsonc } from '../src/jsonc.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ide = process.argv[2];
if (!ide) {
  console.error('usage: node tools/extract-known-keys.js <ide-install-dir>');
  process.exit(2);
}

function* jars(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* jars(p);
    else if (name.endsWith('.jar')) yield p;
  }
}

const uiKeys = new Set();
const editorColors = new Set();
const editorAttributes = new Set();
const parentThemeIds = new Set();

function flattenUi(obj, prefix, out) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flattenUi(v, key, out);
    else out.add(key);
  }
}

function collectScheme(xml) {
  const colorsBlock = xml.match(/<colors>([\s\S]*?)<\/colors>/g) || [];
  for (const block of colorsBlock) {
    for (const m of block.matchAll(/<option name="([^"]+)"/g)) editorColors.add(m[1]);
  }
  const attrBlock = xml.match(/<attributes>([\s\S]*?)<\/attributes>/g) || [];
  for (const block of attrBlock) {
    // Only top-level option names inside <attributes> (attribute keys), not FOREGROUND etc.
    for (const m of block.matchAll(/<option name="([^"]+)"(?:\s+baseAttributes="[^"]*")?\s*\/?>/g)) {
      if (!/^(FOREGROUND|BACKGROUND|FONT_TYPE|EFFECT_TYPE|EFFECT_COLOR|ERROR_STRIPE_COLOR)$/.test(m[1])) {
        editorAttributes.add(m[1]);
      }
    }
  }
}

let ideVersion = 'unknown';
try {
  const info = JSON.parse(readFileSync(join(ide, 'product-info.json'), 'utf8'));
  ideVersion = `${info.productCode}-${info.version} (${info.buildNumber})`;
} catch { /* optional */ }

for (const jar of [...jars(join(ide, 'lib')), ...jars(join(ide, 'plugins'))]) {
  let zip;
  try { zip = readZip(jar); } catch { continue; }
  for (const name of zip.names()) {
    if (name.endsWith('.themeMetadata.json')) {
      const meta = parseJsonc(zip.read(name).toString('utf8'), name);
      for (const k of meta.ui || []) if (k.key && !k.deprecated) uiKeys.add(k.key);
    } else if (name.endsWith('.theme.json')) {
      try {
        const theme = parseJsonc(zip.read(name).toString('utf8'), name);
        if (theme.ui) flattenUi(theme.ui, '', uiKeys);
      } catch { /* not every *.theme.json is a UI theme */ }
    } else if (/(^|\/)(colorSchemes?|themes)\/.*\.(xml|icls)$/.test(name) || name === 'DefaultColorSchemesManager.xml') {
      const xml = zip.read(name).toString('utf8');
      if (xml.includes('<scheme')) collectScheme(xml);
    } else if (name.endsWith('.xml') && name.includes('META-INF')) {
      const xml = zip.read(name).toString('utf8');
      for (const m of xml.matchAll(/<themeProvider\s+id="([^"]+)"/g)) parentThemeIds.add(m[1]);
    }
  }
}

const sorted = (s) => [...s].sort();
mkdirSync(join(root, 'reference'), { recursive: true });
writeFileSync(join(root, 'reference', 'known-ui-keys.json'),
  JSON.stringify({ ide: ideVersion, themeIds: sorted(parentThemeIds), keys: sorted(uiKeys) }, null, 2) + '\n');
writeFileSync(join(root, 'reference', 'known-editor-keys.json'),
  JSON.stringify({ ide: ideVersion, colors: sorted(editorColors), attributes: sorted(editorAttributes) }, null, 2) + '\n');
console.log(`${ideVersion}: ${uiKeys.size} UI keys, ${editorColors.size} editor colors, ${editorAttributes.size} attributes, ${parentThemeIds.size} theme ids`);
