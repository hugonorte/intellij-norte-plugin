// Builds an IntelliJ UI theme (*.theme.json) from a VSCode theme's `colors` block.
import { parseColor, blend, formatHex, key8, isColor } from './color.js';
import { evaluate } from './expr.js';

/** Semantic names for the most used colors (declared in the theme's `colors` block). Order = priority. */
export const PALETTE_ROLES = [
  ['editor.background', 'bgEditor'],
  ['activityBar.background', 'bgBar'],
  ['sideBar.background', 'bgSide'],
  ['input.background', 'bgDeep'],
  ['dropdown.border', 'border'],
  ['foreground', 'fg'],
  ['editor.foreground', 'fgEditor'],
  ['activityBarBadge.background', 'accent'],
  ['focusBorder', 'focus'],
  ['errorForeground', 'error'],
  ['list.activeSelectionBackground', 'selection'],
];

const entries = (o) => Object.entries(o || {}).filter(([k]) => !k.startsWith('_'));
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function setUi(ui, key, value) {
  if (key === '*') return; // handled separately
  ui[key] = value;
}

/**
 * @param variant   entry of variants.config.json
 * @param theme     parsed VSCode theme
 * @param maps      {ui, uiDerived}
 * @param overrides merged overrides ({ui})
 * @param known     optional Set of UI keys known by the IDE
 */
export function buildUiTheme(variant, theme, maps, overrides = {}, known = null) {
  const warnings = [];
  const colors = theme.colors || {};
  const ctx = (where) => ({ colors, where: `${variant.id}: ${where}` });

  // Palette: named colors for semantic roles present in this variant.
  const palette = {}; // name -> color
  const byColor = new Map(); // key8 -> name (first role wins)
  for (const [vsKey, name] of PALETTE_ROLES) {
    if (colors[vsKey] === undefined) continue;
    const c = parseColor(colors[vsKey], `${variant.id}: ${vsKey}`);
    palette[name] = c;
    if (!byColor.has(key8(c))) byColor.set(key8(c), name);
  }
  const used = new Set();
  const out = (c) => {
    const name = byColor.get(key8(c));
    if (name) { used.add(name); return name; }
    return formatHex(c);
  };

  const star = {};
  const ui = {};
  let derivedCount = 0, mappedCount = 0, overrideCount = 0;

  // 1) Derived keys (IntelliJ keys without a VSCode counterpart), expressed over the palette.
  for (const [key, val] of entries(maps.uiDerived)) {
    if (key === '*') {
      for (const [prop, expr] of entries(val)) {
        const r = evaluate(expr, ctx(`*.${prop}`));
        if (r) { star[prop] = out(r.color); derivedCount++; } else warnings.push(`derived *.${prop}: "${expr}" did not resolve`);
      }
      continue;
    }
    const r = evaluate(val, ctx(key));
    if (r) { setUi(ui, key, out(r.color)); derivedCount++; } else warnings.push(`derived ${key}: "${val}" did not resolve`);
  }

  // 2) Direct VSCode -> IntelliJ mapping.
  for (const [vsKey, def] of entries(maps.ui)) {
    if (colors[vsKey] === undefined) continue;
    const spec = Array.isArray(def) ? { to: def } : def;
    let c = parseColor(colors[vsKey], `${variant.id}: ${vsKey}`);
    if (spec.blendOver) {
      const r = evaluate(spec.blendOver.startsWith('@') ? spec.blendOver : `@${spec.blendOver}`, ctx(`${vsKey} blendOver`));
      if (r) c = blend(c, { ...r.color, a: 255 });
      else warnings.push(`${vsKey}: blendOver ${spec.blendOver} not found`);
    }
    for (const k of spec.to) {
      if (k.startsWith('*.')) star[k.slice(2)] = out(c);
      else setUi(ui, k, out(c));
      mappedCount++;
    }
  }

  // 3) Overrides: colors as expressions, other values (numbers, insets, booleans) verbatim.
  for (const [key, val] of entries(overrides.ui)) {
    overrideCount++;
    const target = key.startsWith('*.') ? star : ui;
    const k = key.startsWith('*.') ? key.slice(2) : key;
    if (val === null) { delete target[k]; continue; }
    if (typeof val === 'string' && (val.startsWith('@') || isColor(val))) {
      const r = evaluate(val, ctx(`override ${key}`));
      if (r) target[k] = out(r.color); else warnings.push(`override ${key}: "${val}" did not resolve`);
    } else {
      target[k] = val;
    }
  }

  if (known) {
    const suffixes = new Set([...known].map((k) => k.slice(k.lastIndexOf('.') + 1)));
    for (const k of Object.keys(ui)) if (!known.has(k)) warnings.push(`unknown UI key: ${k}`);
    for (const p of Object.keys(star)) if (!suffixes.has(p)) warnings.push(`unknown UI property for "*": ${p}`);
  }

  const sortedUi = {};
  if (Object.keys(star).length) {
    sortedUi['*'] = {};
    for (const k of Object.keys(star).sort(cmp)) sortedUi['*'][k] = star[k];
  }
  for (const k of Object.keys(ui).sort(cmp)) sortedUi[k] = ui[k];

  const namedColors = {};
  for (const name of [...used].sort(cmp)) namedColors[name] = formatHex(palette[name]);

  const json = {
    name: variant.name,
    dark: variant.dark,
    author: 'Hugo Norte',
    editorScheme: `/themes/${variant.id}.xml`,
  };
  if (variant.parentTheme) json.parentTheme = variant.parentTheme;
  json.colors = namedColors;
  json.ui = sortedUi;

  return {
    json: JSON.stringify(json, null, 2) + '\n',
    stats: {
      uiKeys: Object.keys(ui).length + Object.keys(star).length,
      mapped: mappedCount,
      derived: derivedCount,
      overrides: overrideCount,
      palette: Object.keys(namedColors).length,
    },
    warnings,
  };
}
