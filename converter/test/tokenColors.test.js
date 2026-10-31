import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRules, matchSelector, resolve, fontType, fontEffects, parseJsonc } from '../src/tokenColors.js';

const rules = (tc) => normalizeRules(tc);

test('scope as comma separated string and as array', () => {
  const { rules: r1 } = rules([{ scope: 'a.b, c.d ,e', settings: { foreground: '#111' } }]);
  assert.deepEqual(r1.map((r) => r.selector), ['a.b', 'c.d', 'e']);
  const { rules: r2 } = rules([{ scope: ['a.b', ' c.d'], settings: { foreground: '#111' } }]);
  assert.deepEqual(r2.map((r) => r.selector), ['a.b', 'c.d']);
});

test('rule without scope is the global rule', () => {
  const { rules: r, globalDefaults } = rules([{ settings: { foreground: '#ABB2BF', background: '#161821' } }, { scope: 'x', settings: {} }]);
  assert.equal(r.length, 1);
  assert.deepEqual(globalDefaults, { foreground: '#ABB2BF', background: '#161821' });
});

test('descendant selectors and segment prefix matching', () => {
  assert.ok(matchSelector(['keyword'], ['source.js', 'keyword.control.js']));
  assert.equal(matchSelector(['key'], ['source.js', 'keyword.control.js']), null);
  assert.ok(matchSelector(['meta.class-method.js', 'entity.name.function.js'], ['source.js', 'meta.class-method.js', 'meta.x', 'entity.name.function.js']));
  assert.equal(matchSelector(['meta.class-method.js', 'entity.name.function.js'], ['source.js', 'entity.name.function.js']), null);
  // ancestors must appear in order
  assert.equal(matchSelector(['b', 'a', 'c'], ['a', 'b', 'c']), null);
});

test('the more specific rule wins; ties are broken by order', () => {
  const { rules: r, globalDefaults } = rules([
    { scope: 'entity.name.function', settings: { foreground: '#111111' } },
    { scope: 'entity.name', settings: { foreground: '#222222' } },
    { scope: 'meta.class-method.js entity.name.function.js', settings: { foreground: '#333333' } },
  ]);
  assert.equal(resolve(['source.js', 'entity.name.function.js'], r, globalDefaults).foreground, '#111111');
  assert.equal(resolve(['source.js', 'meta.class-method.js', 'entity.name.function.js'], r, globalDefaults).foreground, '#333333');
  const tie = rules([
    { scope: 'keyword', settings: { foreground: '#111111' } },
    { scope: 'keyword', settings: { foreground: '#222222' } },
  ]);
  assert.equal(resolve(['keyword.control'], tie.rules, {}).foreground, '#222222');
});

test('a fontStyle-only rule does not erase the foreground', () => {
  const { rules: r } = rules([
    { scope: 'comment', settings: { foreground: '#5C6370' } },
    { scope: 'comment.line', settings: { fontStyle: 'italic' } },
  ]);
  const res = resolve(['source.js', 'comment.line.double-slash.js'], r, {});
  assert.equal(res.foreground, '#5C6370');
  assert.equal(res.fontStyle, 'italic');
});

test('fontStyle "" resets italic', () => {
  const { rules: r } = rules([
    { scope: 'storage', settings: { fontStyle: 'italic' } },
    { scope: 'storage.type', settings: { fontStyle: '' } },
  ]);
  assert.equal(resolve(['storage.type.js'], r, {}).fontStyle, '');
  assert.equal(fontType(''), 0);
});

test('global defaults when nothing matches', () => {
  const { rules: r, globalDefaults } = rules([{ settings: { foreground: '#ABB2BF' } }, { scope: 'string', settings: { foreground: '#98C379' } }]);
  const res = resolve(['source.js', 'variable.other.readwrite.js'], r, globalDefaults);
  assert.equal(res.foreground, '#ABB2BF');
  assert.equal(res.usedGlobal, true);
});

test('exclusion selectors ("a - b")', () => {
  const { rules: r } = rules([{ scope: 'constant.numeric.line-number - match', settings: { foreground: '#111111' } }]);
  assert.equal(resolve(['constant.numeric.line-number.x'], r, {}).foreground, '#111111');
  assert.equal(resolve(['match.y', 'constant.numeric.line-number.x'], r, {}).usedGlobal, true);
});

test('fontStyle conversion', () => {
  assert.equal(fontType('bold'), 1);
  assert.equal(fontType('italic'), 2);
  assert.equal(fontType('bold italic'), 3);
  assert.equal(fontType('italic underline'), 2);
  assert.deepEqual(fontEffects('italic underline'), { underline: true, strikethrough: false });
  assert.deepEqual(fontEffects('strikethrough'), { underline: false, strikethrough: true });
});

test('JSONC: comments, trailing commas and strings containing //', () => {
  const text = `{
    // line comment
    "url": "https://example.com/a//b", /* block
    comment */ "list": [1, 2, 3,],
    "s": "/* not a comment */",
    "esc": "quote \\" // still string",
  }`;
  assert.deepEqual(parseJsonc(text), {
    url: 'https://example.com/a//b',
    list: [1, 2, 3],
    s: '/* not a comment */',
    esc: 'quote " // still string',
  });
  assert.throws(() => parseJsonc('{ "a": }', 'broken.json'), /broken\.json/);
});
