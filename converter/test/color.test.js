import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, blend, hex6, formatHex, withOpacity, adjustLightness, contrastRatio } from '../src/color.js';

test('parses #RGB, #RRGGBB and #RRGGBBAA in any case', () => {
  assert.deepEqual(parseColor('#abc'), { r: 0xaa, g: 0xbb, b: 0xcc, a: 255 });
  assert.deepEqual(parseColor('#ABCD'), { r: 0xaa, g: 0xbb, b: 0xcc, a: 0xdd });
  assert.deepEqual(parseColor('#61AFEF'), { r: 0x61, g: 0xaf, b: 0xef, a: 255 });
  assert.deepEqual(parseColor('#6796e6'), { r: 0x67, g: 0x96, b: 0xe6, a: 255 });
  assert.deepEqual(parseColor('#E06C7590'), { r: 0xe0, g: 0x6c, b: 0x75, a: 0x90 });
  assert.deepEqual(parseColor(' 161821 '), { r: 0x16, g: 0x18, b: 0x21, a: 255 });
});

test('rejects invalid colors with context', () => {
  assert.throws(() => parseColor('#12'), /invalid color: #12/);
  assert.throws(() => parseColor('#12345'), /invalid color/);
  assert.throws(() => parseColor('#GGGGGG', 'file.json: key'), /file\.json: key/);
  assert.throws(() => parseColor(undefined), /invalid color/);
});

test('blend(#5755D930, #161821) == 222344', () => {
  assert.equal(hex6(blend(parseColor('#5755D930'), parseColor('#161821'))), '222344');
});

test('blend with alpha 0 returns the background, alpha 255 the foreground', () => {
  const bg = parseColor('#161821');
  assert.equal(hex6(blend(parseColor('#FFFFFF00'), bg)), '161821');
  assert.equal(hex6(blend(parseColor('#61AFEFFF'), bg)), '61afef');
});

test('output formats', () => {
  assert.equal(hex6(parseColor('#61AFEF')), '61afef');
  assert.throws(() => hex6(parseColor('#61AFEF80')), /opaque/);
  assert.equal(formatHex(parseColor('#ae81ff')), '#AE81FF');
  assert.equal(formatHex(parseColor('#ae81ff1b')), '#AE81FF1B');
});

test('opacity and lightness modifiers', () => {
  assert.equal(formatHex(withOpacity(parseColor('#C8DDFC'), 40)), '#C8DDFC66');
  assert.equal(formatHex(withOpacity(parseColor('#C8DDFC80'), 100)), '#C8DDFC');
  assert.equal(formatHex(adjustLightness(parseColor('#808080'), 10)), '#9A9A9A');
  assert.equal(formatHex(adjustLightness(parseColor('#808080'), -100)), '#000000');
});

test('WCAG contrast: black/white = 21, same color = 1', () => {
  assert.equal(Math.round(contrastRatio(parseColor('#000'), parseColor('#fff'))), 21);
  assert.equal(contrastRatio(parseColor('#161821'), parseColor('#161821')), 1);
});
