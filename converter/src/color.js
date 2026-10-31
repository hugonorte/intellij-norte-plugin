// Color utilities: parsing, normalization, alpha blending, HSL adjustments and WCAG contrast.

/** Parses #RGB, #RGBA, #RRGGBB or #RRGGBBAA (case-insensitive, '#' optional) into {r,g,b,a} (0..255). */
export function parseColor(str, ctx = '') {
  if (typeof str !== 'string') throw new Error(`invalid color: ${JSON.stringify(str)}${ctx ? ` (${ctx})` : ''}`);
  let s = str.trim().replace(/^#/, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(s)) throw new Error(`invalid color: ${str}${ctx ? ` (${ctx})` : ''}`);
  if (s.length === 3 || s.length === 4) s = [...s].map((d) => d + d).join('');
  let a = 255;
  if (s.length === 8) {
    a = parseInt(s.slice(6, 8), 16);
    s = s.slice(0, 6);
  } else if (s.length !== 6) {
    throw new Error(`invalid color: ${str}${ctx ? ` (${ctx})` : ''}`);
  }
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16), a };
}

export function isColor(str) {
  try { parseColor(str); return true; } catch { return false; }
}

/** "source-over" composition of fg on an opaque bg. */
export function blend(fg, bg) {
  const a = fg.a / 255;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 255,
  };
}

const h2 = (n) => n.toString(16).padStart(2, '0');

/** 6 lowercase hex digits without '#', used in editor scheme XML (alpha is not supported there). */
export function hex6(c) {
  if (c.a !== 255) throw new Error('hex6() requires an opaque color; blend() it first');
  return `${h2(c.r)}${h2(c.g)}${h2(c.b)}`;
}

/** #RRGGBB or #RRGGBBAA in uppercase, used in *.theme.json. */
export function formatHex(c) {
  const base = `#${h2(c.r)}${h2(c.g)}${h2(c.b)}`;
  return (c.a === 255 ? base : base + h2(c.a)).toUpperCase();
}

/** Canonical 8-digit key used to compare colors. */
export function key8(c) {
  return `${h2(c.r)}${h2(c.g)}${h2(c.b)}${h2(c.a)}`;
}

/** Replaces the alpha channel with pct% opacity. */
export function withOpacity(c, pct) {
  return { ...c, a: Math.round((Math.max(0, Math.min(100, pct)) / 100) * 255) };
}

function rgbToHsl({ r, g, b }) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return { h: h / 6, s, l };
}

function hslToRgb({ h, s, l }) {
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
  const hue = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue(p, q, h + 1 / 3) * 255),
    g: Math.round(hue(p, q, h) * 255),
    b: Math.round(hue(p, q, h - 1 / 3) * 255),
  };
}

/** Adds pct percentage points of HSL lightness (negative darkens). */
export function adjustLightness(c, pct) {
  const hsl = rgbToHsl(c);
  hsl.l = Math.max(0, Math.min(1, hsl.l + pct / 100));
  return { ...hslToRgb(hsl), a: c.a };
}

export function relativeLuminance({ r, g, b }) {
  const lin = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.x contrast ratio (1..21). Report-only: never used to change colors. */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
