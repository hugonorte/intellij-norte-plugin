#!/usr/bin/env node
// Norte converter: VSCode color theme JSON -> IntelliJ Platform UI theme + editor color scheme.
//
//   node src/index.js --out <dir> [--source <dir>] [--plugin-xml <file>] [--verbose] [--check]
//   node src/index.js --update-snapshots
//
// Source directory precedence: --source > NRT_SOURCE_DIR > sourceDir in sources.local.json.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonc } from './jsonc.js';
import { buildEditorScheme } from './buildEditorScheme.js';
import { buildUiTheme } from './buildUiTheme.js';

export const CONVERTER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const readJson = (file) => parseJsonc(readFileSync(file, 'utf8'), file);
const readJsonIfExists = (file) => (existsSync(file) ? readJson(file) : null);

export function loadConfig(root = CONVERTER_ROOT) {
  const config = readJson(join(root, 'variants.config.json'));
  const maps = {
    ui: readJson(join(root, 'mappings', 'ui-map.json')),
    uiDerived: readJson(join(root, 'mappings', 'ui-derived.json')),
    editorColors: readJson(join(root, 'mappings', 'editor-colors-map.json')),
    syntax: readJson(join(root, 'mappings', 'syntax-map.json')),
  };
  const knownUi = readJsonIfExists(join(root, 'reference', 'known-ui-keys.json'));
  const knownEditor = readJsonIfExists(join(root, 'reference', 'known-editor-keys.json'));
  const knownExtra = readJsonIfExists(join(root, 'reference', 'known-editor-keys-extra.json'));
  const known = {
    ui: knownUi ? new Set(knownUi.keys) : null,
    editor: knownEditor
      ? {
          colors: new Set([...knownEditor.colors, ...(knownExtra?.colors || [])]),
          attributes: new Set([...knownEditor.attributes, ...(knownExtra?.attributes || [])]),
          parentDefined: knownEditor.parentDefined || {},
        }
      : null,
  };
  return { config, maps, known };
}

/** Merges overrides/_all.json with overrides/<id>.json. Attributes are merged per property. */
export function loadOverrides(id, root = CONVERTER_ROOT) {
  const files = ['_all.json', `${id}.json`].map((f) => join(root, 'overrides', f));
  const merged = { ui: {}, editorColors: {}, attributes: {}, _notes: {} };
  for (const f of files) {
    const o = readJsonIfExists(f);
    if (!o) continue;
    for (const section of ['ui', 'editorColors', 'attributes', '_notes']) {
      for (const [k, v] of Object.entries(o[section] || {})) {
        if (section === 'attributes' && v && merged.attributes[k] && !v.baseAttributes) {
          merged.attributes[k] = { ...merged.attributes[k], ...v };
        } else {
          merged[section][k] = v;
        }
      }
    }
    validateNotes(o, basename(f));
  }
  return merged;
}

/** Every override must be justified in _notes. */
export function validateNotes(o, file) {
  const notes = o._notes || {};
  const missing = [];
  for (const section of ['ui', 'editorColors', 'attributes']) {
    for (const k of Object.keys(o[section] || {})) {
      if (!k.startsWith('_') && !notes[k]) missing.push(`${section}.${k}`);
    }
  }
  if (missing.length) throw new Error(`overrides/${file}: missing _notes for ${missing.join(', ')}`);
}

export function loadSources({ source, root = CONVERTER_ROOT } = {}) {
  const localFile = join(root, 'sources.local.json');
  if (!existsSync(localFile)) {
    throw new Error(
      'converter/sources.local.json not found.\n' +
        'Copy converter/sources.example.json to converter/sources.local.json and fill in "sourceDir"\n' +
        '(folder with the VSCode theme JSON files) and the file name of each variant.\n' +
        'The directory can also be given with --source <dir> or the NRT_SOURCE_DIR environment variable.',
    );
  }
  const local = readJson(localFile);
  const sourceDir = source || process.env.NRT_SOURCE_DIR || local.sourceDir;
  if (!sourceDir) throw new Error('source directory not set (use --source, NRT_SOURCE_DIR or sourceDir in sources.local.json)');
  return { sourceDir, files: local.files || {} };
}

/** Converts every variant. Returns { files: {name: content}, reports: [...] } without touching the disk. */
export function convertAll({ sourceDir, files }, root = CONVERTER_ROOT) {
  const { config, maps, known } = loadConfig(root);
  const out = {};
  const reports = [];
  for (const variant of config.variants) {
    const file = files[variant.id];
    if (!file) throw new Error(`no source file configured for ${variant.id} in sources.local.json`);
    const theme = readJson(join(sourceDir, file));
    const overrides = loadOverrides(variant.id, root);
    const scheme = buildEditorScheme(variant, theme, maps, overrides, known.editor);
    const ui = buildUiTheme(variant, theme, maps, overrides, known.ui);
    out[`${variant.id}.xml`] = scheme.xml;
    out[`${variant.id}.theme.json`] = ui.json;
    reports.push({ variant, scheme, ui });
  }
  return { files: out, reports, config };
}

export function pluginXmlBlock(variants) {
  return variants
    .map((v) => `    <themeProvider id="${v.uuid}" path="/themes/${v.id}.theme.json"/>`)
    .join('\n');
}

export function updatePluginXml(file, variants) {
  const text = readFileSync(file, 'utf8');
  const re = /(<!-- BEGIN GENERATED -->\n)[\s\S]*?(\n\s*<!-- END GENERATED -->)/;
  if (!re.test(text)) throw new Error(`${file}: BEGIN/END GENERATED markers not found`);
  const next = text.replace(re, `$1${pluginXmlBlock(variants)}$2`);
  if (next !== text) writeFileSync(file, next);
  return next !== text;
}

function printReport(reports, verbose) {
  for (const { variant, scheme, ui } of reports) {
    console.log(
      `${variant.id.padEnd(18)} ui: ${ui.stats.uiKeys} keys (${ui.stats.mapped} mapped, ${ui.stats.derived} derived, ${ui.stats.overrides} overrides)` +
        ` | editor: ${scheme.stats.editorColors} colors, ${scheme.stats.attributes} attributes (${scheme.stats.fallbacks} inherited), ${scheme.stats.overrides} overrides` +
        ` | warnings: ${ui.warnings.length + scheme.warnings.length}`,
    );
    for (const w of [...ui.warnings, ...scheme.warnings]) console.log(`  warning: ${w}`);
    if (scheme.parentOnly.length) {
      console.log(`  info: ${scheme.parentOnly.length} attribute keys keep the ${variant.parentScheme} colors (use --verbose to list)`);
    }
    if (verbose) {
      if (scheme.parentOnly.length) console.log(`  parent-only keys: ${scheme.parentOnly.join(' ')}`);
      for (const i of scheme.info) console.log(`  info: ${i}`);
      for (const [k, sel] of Object.entries(scheme.winners).sort()) console.log(`  ${k} <- ${sel}`);
      if (scheme.unusedRules.length) console.log(`  rules that never won (${scheme.unusedRules.length}): ${scheme.unusedRules.join(' | ')}`);
    }
  }
}

function parseArgs(argv) {
  const args = { verbose: false, check: false, updateSnapshots: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--source') args.source = argv[++i];
    else if (a === '--plugin-xml') args.pluginXml = argv[++i];
    else if (a === '--verbose') args.verbose = true;
    else if (a === '--check') args.check = true;
    else if (a === '--update-snapshots') args.updateSnapshots = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (args.updateSnapshots) args.out = join(CONVERTER_ROOT, 'test', '__snapshots__');
  if (!args.out) throw new Error('missing --out <dir>');
  return args;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const sources = loadSources({ source: args.source });
  const { files, reports, config } = convertAll(sources);
  printReport(reports, args.verbose);
  const outDir = resolve(args.out);
  if (args.check) {
    const stale = Object.entries(files).filter(([n, c]) => !existsSync(join(outDir, n)) || readFileSync(join(outDir, n), 'utf8') !== c);
    if (stale.length) {
      console.error(`out of date: ${stale.map(([n]) => n).join(', ')}`);
      return 1;
    }
    console.log('generated files are up to date');
    return 0;
  }
  mkdirSync(outDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(outDir, name), content, 'utf8');
  // Remove stale generated files of variants that no longer exist.
  const expected = new Set(Object.keys(files));
  for (const f of readdirSync(outDir)) {
    if (/^NRT.*\.(xml|theme\.json)$/.test(f) && !expected.has(f)) console.log(`note: ${f} is not produced anymore (not deleted)`);
  }
  console.log(`wrote ${Object.keys(files).length} files to ${outDir}`);
  if (args.pluginXml) {
    const changed = updatePluginXml(resolve(args.pluginXml), config.variants);
    console.log(`plugin.xml ${changed ? 'updated' : 'already up to date'}`);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main();
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exitCode = 1;
  }
}
