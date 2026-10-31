// Builds an IntelliJ editor color scheme (XML) from a VSCode theme.
import { parseColor, blend, hex6, contrastRatio } from './color.js';
import { normalizeRules, resolve, fontType, fontEffects } from './tokenColors.js';
import { evaluate } from './expr.js';
import { serializeScheme } from './xml.js';

// Verified in the IDE's bundled schemes (HYPERLINK_ATTRIBUTES=1, ERRORS_ATTRIBUTES=2, DEPRECATED_ATTRIBUTES=3).
export const EFFECT_UNDERSCORE = 1;
export const EFFECT_WAVE = 2;
export const EFFECT_STRIKEOUT = 3;

const COLOR_PROPS = new Set(['FOREGROUND', 'BACKGROUND', 'EFFECT_COLOR', 'ERROR_STRIPE_COLOR']);
const entries = (o) => Object.entries(o || {}).filter(([k]) => !k.startsWith('_'));

/**
 * @param variant  entry of variants.config.json
 * @param theme    parsed VSCode theme ({colors, tokenColors})
 * @param maps     {syntax, editorColors}
 * @param overrides merged overrides ({editorColors, attributes})
 * @param known    optional {colors:Set, attributes:Set} of key names the IDE knows
 */
export function buildEditorScheme(variant, theme, maps, overrides = {}, known = null) {
  const warnings = [];
  const info = [];
  const colors = theme.colors || {};
  const { rules, globalDefaults } = normalizeRules(theme.tokenColors || []);

  const bgSrc = colors['editor.background'] ?? globalDefaults.background;
  if (!bgSrc) throw new Error(`${variant.id}: editor.background is required`);
  const editorBg = parseColor(bgSrc, `${variant.id}: editor.background`);
  const textFgSrc = globalDefaults.foreground ?? colors['editor.foreground'];
  if (!textFgSrc) throw new Error(`${variant.id}: editor foreground is required`);
  const textFg = blend(parseColor(textFgSrc, `${variant.id}: text foreground`), editorBg);

  const opaque = (c) => blend(c, editorBg);
  const resolvedFg = {}; // key -> opaque color (for @syntax: references)
  const attributes = {};
  const winners = {}; // key -> selector that provided the foreground (verbose report)
  const usedRules = new Set();

  attributes.TEXT = { FOREGROUND: hex6(textFg), BACKGROUND: hex6(opaque(editorBg)) };
  resolvedFg.TEXT = textFg;

  // 1) Syntax attributes resolved through representative TextMate scope stacks.
  const fallbacks = {};
  for (const [key, def] of entries(maps.syntax)) {
    if (def.inherit) {
      // Always inherit from another key (neutralizes colors the parent scheme sets for this key).
      attributes[key] = { baseAttributes: def.inherit };
      fallbacks[key] = def.inherit;
      continue;
    }
    const r = resolve(def.scopes, rules, globalDefaults);
    for (const sel of Object.values(r.matched)) if (sel) usedRules.add(sel);
    if (r.usedGlobal && def.fallback) {
      attributes[key] = { baseAttributes: def.fallback };
      fallbacks[key] = def.fallback;
      info.push(`${key}: no rule matched, inherits ${def.fallback}`);
      continue;
    }
    if (r.usedGlobal) {
      warnings.push(r.matchedAny
        ? `${key}: only fontStyle rules matched ${def.scopes.join(' ')}; foreground is the default text color`
        : `${key}: no tokenColors rule matched ${def.scopes.join(' ')}; using the default text color`);
    }
    const fg = opaque(parseColor(r.foreground ?? textFgSrc, `${variant.id}: ${key}`));
    const attr = { FOREGROUND: hex6(fg) };
    const ft = fontType(r.fontStyle);
    if (ft) attr.FONT_TYPE = ft;
    const fx = fontEffects(r.fontStyle);
    if (fx.underline || fx.strikethrough) {
      attr.EFFECT_COLOR = hex6(fg);
      attr.EFFECT_TYPE = fx.strikethrough ? EFFECT_STRIKEOUT : EFFECT_UNDERSCORE;
    }
    if (def.background && r.background) attr.BACKGROUND = hex6(opaque(parseColor(r.background, `${variant.id}: ${key}`)));
    attributes[key] = attr;
    resolvedFg[key] = fg;
    winners[key] = r.matched.foreground ?? '(default foreground)';
  }
  const syntaxColor = (key) => {
    const seen = new Set();
    let k = key;
    while (fallbacks[k] && !resolvedFg[k] && !seen.has(k)) { seen.add(k); k = fallbacks[k]; }
    return resolvedFg[k];
  };

  const ctx = (where) => ({
    colors,
    where: `${variant.id}: ${where}`,
    syntax: syntaxColor,
    scope: (stack) => {
      const r = resolve(stack, rules, globalDefaults);
      return r.usedGlobal ? undefined : parseColor(r.foreground, `${variant.id}: @scope:${stack.join(' ')}`);
    },
  });
  const evalColor = (expr, where, keepAlpha = false) => {
    const res = evaluate(expr, ctx(where));
    if (!res) return undefined;
    // Only a few scheme colors (ScrollBar.*) accept RGBA; everything else is composed over the editor.
    if (keepAlpha && res.color.a < 255) return hex6({ ...res.color, a: 255 }) + res.color.a.toString(16).padStart(2, '0');
    return hex6(opaque(res.color));
  };
  // A color spec is an expression, "" (explicit empty value), or {value, keepAlpha}.
  const evalColorSpec = (spec, where) => {
    if (spec === '') return '';
    if (spec && typeof spec === 'object') return evalColor(spec.value, where, !!spec.keepAlpha);
    return evalColor(spec, where);
  };
  const alphaKeys = new Set();

  // 2) <colors> from VSCode workbench colors.
  const schemeColors = {};
  for (const [key, spec] of entries(maps.editorColors?.colors)) {
    if (spec && typeof spec === 'object' && spec.keepAlpha) alphaKeys.add(key);
    const v = evalColorSpec(spec, key);
    if (v !== undefined) schemeColors[key] = v;
  }

  // 3) Editor attributes derived from workbench colors (search, braces, console...).
  const applyAttr = (key, spec, where, base = {}) => {
    const out = { ...base };
    for (const [prop, expr] of Object.entries(spec)) {
      if (prop.startsWith('_')) continue;
      if (expr === null) { delete out[prop]; continue; }
      if (typeof expr === 'number') { out[prop] = expr; continue; }
      if (!COLOR_PROPS.has(prop)) { out[prop] = expr; continue; }
      const v = evalColor(expr, `${where}.${prop}`);
      if (v !== undefined) out[prop] = v;
    }
    return out;
  };
  for (const [key, spec] of entries(maps.editorColors?.attributes)) {
    const attr = applyAttr(key, spec, key);
    const hasColor = Object.keys(attr).some((p) => COLOR_PROPS.has(p));
    if (hasColor) {
      attributes[key] = attr;
      if (attr.FOREGROUND) resolvedFg[key] = parseColor(attr.FOREGROUND);
    }
  }

  // 4) Overrides (already merged: _all, then the variant file).
  let overrideCount = 0;
  for (const [key, spec] of entries(overrides.editorColors)) {
    overrideCount++;
    if (spec === null) { delete schemeColors[key]; continue; }
    if (spec && typeof spec === 'object' && spec.keepAlpha) alphaKeys.add(key);
    const v = evalColorSpec(spec, `override ${key}`);
    if (v === undefined) warnings.push(`override ${key}: expression ${JSON.stringify(spec)} did not resolve`);
    else schemeColors[key] = v;
  }
  for (const [key, spec] of entries(overrides.attributes)) {
    overrideCount++;
    if (spec === null) { delete attributes[key]; continue; }
    if (spec.baseAttributes) { attributes[key] = { baseAttributes: spec.baseAttributes }; continue; }
    const base = attributes[key]?.baseAttributes ? {} : attributes[key];
    attributes[key] = applyAttr(key, spec, `override ${key}`, base);
    if (attributes[key].FOREGROUND) resolvedFg[key] = parseColor(attributes[key].FOREGROUND);
  }

  // 5) Validation.
  for (const [k, v] of Object.entries(schemeColors)) {
    const ok = v === '' || /^[0-9a-f]{6}$/.test(v) || (alphaKeys.has(k) && /^[0-9a-f]{8}$/.test(v));
    if (!ok) throw new Error(`${variant.id}: color ${k} has invalid value ${v}`);
  }
  for (const [k, a] of Object.entries(attributes)) {
    for (const p of Object.keys(a)) {
      if (COLOR_PROPS.has(p) && !/^[0-9a-f]{6}$/.test(a[p])) throw new Error(`${variant.id}: ${k}.${p} has invalid value ${a[p]}`);
    }
  }
  let parentOnly = [];
  if (known) {
    for (const k of Object.keys(schemeColors)) if (!known.colors.has(k)) warnings.push(`unknown editor color key: ${k}`);
    for (const k of Object.keys(attributes)) if (!known.attributes.has(k)) warnings.push(`unknown attribute key: ${k}`);
    // Keys the parent scheme colors explicitly and this scheme does not set: their parent colors show through.
    parentOnly = (known.parentDefined?.[variant.parentScheme] || []).filter((k) => !attributes[k]);
  }
  const text = parseColor(attributes.TEXT.FOREGROUND);
  const bg = parseColor(attributes.TEXT.BACKGROUND);
  const textContrast = contrastRatio(text, bg);
  if (textContrast < 4.5) warnings.push(`contrast TEXT foreground/background is ${textContrast.toFixed(2)} (< 4.5)`);
  const comment = resolvedFg.DEFAULT_LINE_COMMENT;
  if (comment) {
    const c = contrastRatio(comment, bg);
    if (c < 3) info.push(`contrast comment/background is ${c.toFixed(2)} (< 3.0, expected for this palette)`);
  }

  const xml = serializeScheme({ name: variant.name, parentScheme: variant.parentScheme, colors: schemeColors, attributes });
  const unusedRules = [...new Set(rules.map((r) => r.selector))].filter((s) => !usedRules.has(s));
  return {
    xml,
    stats: {
      editorColors: Object.keys(schemeColors).length,
      attributes: Object.keys(attributes).length,
      syntax: entries(maps.syntax).length,
      fallbacks: Object.keys(fallbacks).length,
      overrides: overrideCount,
    },
    warnings,
    info,
    winners,
    unusedRules,
    parentOnly,
  };
}
