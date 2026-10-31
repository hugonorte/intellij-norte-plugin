import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonc } from '../src/jsonc.js';
import { buildEditorScheme } from '../src/buildEditorScheme.js';
import { buildUiTheme } from '../src/buildUiTheme.js';
import { validateNotes } from '../src/index.js';
import { evaluate } from '../src/expr.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (n) => parseJsonc(readFileSync(join(here, 'fixtures', n), 'utf8'));
const dark = fixture('fixture-dark.json');
const light = fixture('fixture-light.json');
const darkVariant = { id: 'NRT', name: 'Norte & Co <test>', dark: true, parentScheme: 'Darcula', parentTheme: 'Islands Dark' };
const lightVariant = { id: 'NRT-Light', name: 'Norte Light', dark: false, parentScheme: 'Default' };

const maps = {
  syntax: {
    DEFAULT_KEYWORD: { scopes: ['source.js', 'keyword.control.conditional.js'] },
    DEFAULT_LINE_COMMENT: { scopes: ['source.js', 'comment.line.double-slash.js'] },
    DEFAULT_CLASS_NAME: { scopes: ['source.js', 'entity.name.type.class.js'] },
    DEPRECATED_ATTRIBUTES: { scopes: ['source.js', 'invalid.deprecated'], background: true },
    JSON_KEY: { scopes: ['source.json', 'support.type.property-name.json'] },
    DEFAULT_LABEL: { scopes: ['source.js', 'entity.name.label.js'], fallback: 'DEFAULT_IDENTIFIER' },
  },
  editorColors: {
    colors: {
      SELECTION_BACKGROUND: '@editor.selectionBackground',
      LINE_NUMBERS_COLOR: '@editorLineNumber.foreground',
      GUTTER_BACKGROUND: '@editorGutter.background|@editor.background',
      MISSING: '@does.not.exist',
    },
    attributes: {
      CONSOLE_RED_OUTPUT: { FOREGROUND: '@terminal.ansiRed|@scope:source.js variable.language.this.js' },
    },
  },
  ui: {
    'sideBar.background': ['Tree.background', 'Panel.background'],
    'activityBar.background': ['StatusBar.background'],
    'list.activeSelectionBackground': { to: ['List.selectionBackground'], blendOver: 'sideBar.background' },
  },
  uiDerived: {
    '*': { background: '@sideBar.background', disabledForeground: '@foreground~40' },
    'Panel.background': '@panel.background|@sideBar.background',
    'Tree.background': '@activityBar.background',
  },
};

test('editor scheme: sorted, 6-digit values without #, correct parent_scheme, escaped name', () => {
  const { xml } = buildEditorScheme(darkVariant, dark, maps, {});
  assert.match(xml, /^<scheme name="Norte &amp; Co &lt;test&gt;" version="142" parent_scheme="Darcula">/);
  const values = [...xml.matchAll(/value="([^"]*)"/g)].map((m) => m[1]).filter((v) => !/^\d$/.test(v));
  for (const v of values) assert.match(v, /^[0-9a-f]{6}$/);
  assert.ok(!xml.includes('#'));
  const names = [...xml.matchAll(/^ {4}<option name="([^"]+)"/gm)].map((m) => m[1]);
  const colorsEnd = xml.indexOf('</colors>');
  const colorNames = [...xml.slice(0, colorsEnd).matchAll(/<option name="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(colorNames, [...colorNames].sort());
  const attrNames = names.filter((n) => !colorNames.includes(n));
  assert.deepEqual(attrNames, [...attrNames].sort());
  const l = buildEditorScheme(lightVariant, light, maps, {});
  assert.match(l.xml, /parent_scheme="Default"/);
});

test('editor scheme: blending, fallbacks, effects and @scope', () => {
  const r = buildEditorScheme(darkVariant, dark, maps, {});
  assert.match(r.xml, /name="SELECTION_BACKGROUND" value="222344"/);
  assert.match(r.xml, /name="GUTTER_BACKGROUND" value="161821"/);
  assert.ok(!r.xml.includes('MISSING'));
  // #E06C7590 blended over #161821
  assert.match(r.xml, /<option name="JSON_KEY">\s*<value>\s*<option name="FOREGROUND" value="884750" \/>/);
  assert.match(r.xml, /<option name="DEFAULT_LABEL" baseAttributes="DEFAULT_IDENTIFIER" \/>/);
  // italic underline -> FONT_TYPE 2 + underscore effect
  assert.match(r.xml, /name="DEFAULT_CLASS_NAME">\s*<value>\s*<option name="FOREGROUND" value="e5c07b" \/>\s*<option name="FONT_TYPE" value="2" \/>\s*<option name="EFFECT_COLOR" value="e5c07b" \/>\s*<option name="EFFECT_TYPE" value="1" \/>/);
  // strikethrough + background
  assert.match(r.xml, /name="DEPRECATED_ATTRIBUTES">\s*<value>\s*<option name="FOREGROUND" value="523d14" \/>\s*<option name="BACKGROUND" value="e0c285" \/>\s*<option name="EFFECT_COLOR" value="523d14" \/>\s*<option name="EFFECT_TYPE" value="3" \/>/);
  // no terminal colors in the dark fixture -> resolved from tokenColors
  assert.match(r.xml, /name="CONSOLE_RED_OUTPUT">\s*<value>\s*<option name="FOREGROUND" value="e06c75" \/>/);
  // terminal colors have priority when present
  const l = buildEditorScheme(lightVariant, light, maps, {});
  assert.match(l.xml, /name="CONSOLE_RED_OUTPUT">\s*<value>\s*<option name="FOREGROUND" value="e45649" \/>/);
  // TEXT uses the tokenColors global foreground (light has none -> editor.foreground)
  assert.match(r.xml, /name="TEXT">\s*<value>\s*<option name="FOREGROUND" value="abb2bf" \/>\s*<option name="BACKGROUND" value="161821" \/>/);
  assert.match(l.xml, /name="TEXT">\s*<value>\s*<option name="FOREGROUND" value="383a42" \/>/);
});

test('editor scheme: overrides with @syntax references', () => {
  const overrides = {
    editorColors: { RIGHT_MARGIN_COLOR: '@dropdown.border' },
    attributes: { TODO_DEFAULT_ATTRIBUTES: { FOREGROUND: '@syntax:DEFAULT_KEYWORD', FONT_TYPE: 2 } },
  };
  const r = buildEditorScheme(darkVariant, dark, maps, overrides);
  assert.match(r.xml, /name="RIGHT_MARGIN_COLOR" value="292a32"/);
  assert.match(r.xml, /name="TODO_DEFAULT_ATTRIBUTES">\s*<value>\s*<option name="FOREGROUND" value="c678dd" \/>\s*<option name="FONT_TYPE" value="2" \/>/);
  assert.equal(r.stats.overrides, 2);
});

test('ui theme: precedence derived < mapped < overrides', () => {
  const overrides = { ui: { 'StatusBar.background': '@editor.background', 'EditorTabs.underlineHeight': 2 } };
  const { json } = buildUiTheme(darkVariant, dark, maps, overrides);
  const t = JSON.parse(json);
  // Tree.background: derived (activityBar) replaced by mapped (sideBar)
  assert.equal(t.ui['Tree.background'], 'bgSide');
  // StatusBar.background: mapped (activityBar) replaced by override (editor.background)
  assert.equal(t.ui['StatusBar.background'], 'bgEditor');
  assert.equal(t.ui['EditorTabs.underlineHeight'], 2);
  assert.equal(t.colors.bgEditor, '#161821');
});

test('ui theme: "|" fallback, opacity modifier, blendOver, editorScheme path, parentTheme', () => {
  const d = JSON.parse(buildUiTheme(darkVariant, dark, maps, {}).json);
  const l = JSON.parse(buildUiTheme(lightVariant, light, maps, {}).json);
  // dark has no panel.background -> sideBar.background, but mapping overrides Panel.background anyway
  assert.equal(d.ui['Panel.background'], 'bgSide');
  assert.equal(d.ui['*'].disabledForeground, '#C8DDFC66');
  // #AE81FF1B over #222330
  assert.equal(d.ui['List.selectionBackground'], '#312D46');
  assert.equal(d.editorScheme, '/themes/NRT.xml');
  assert.equal(l.editorScheme, '/themes/NRT-Light.xml');
  assert.equal(d.parentTheme, 'Islands Dark');
  assert.equal(l.parentTheme, undefined);
  assert.equal(l.dark, false);
  assert.equal(l.author, 'Hugo Norte');
});

test('expression fallback picks the first alternative that exists', () => {
  const ctx = { colors: { b: '#222222' } };
  assert.equal(evaluate('@a|@b', ctx).source, '@b');
  assert.equal(evaluate('@a', ctx), undefined);
});

test('every override needs a justification in _notes', () => {
  assert.throws(() => validateNotes({ ui: { 'A.b': '@x' }, _notes: {} }, 'x.json'), /missing _notes for ui\.A\.b/);
  assert.doesNotThrow(() => validateNotes({ ui: { 'A.b': '@x' }, _notes: { 'A.b': 'why' } }, 'x.json'));
});

test('unknown keys produce warnings', () => {
  const known = { colors: new Set(['SELECTION_BACKGROUND']), attributes: new Set(['TEXT']) };
  const r = buildEditorScheme(darkVariant, dark, maps, {}, known);
  assert.ok(r.warnings.some((w) => w.includes('unknown editor color key: LINE_NUMBERS_COLOR')));
  assert.ok(r.warnings.some((w) => w.includes('unknown attribute key: JSON_KEY')));
  const u = buildUiTheme(darkVariant, dark, maps, {}, new Set(['Tree.background', 'X.background']));
  assert.ok(u.warnings.some((w) => w.includes('unknown UI key: Panel.background')));
});
