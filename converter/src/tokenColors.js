// Normalization of VSCode `tokenColors` and a simplified TextMate selector matcher.
export { parseJsonc, stripJsonc } from './jsonc.js';

/**
 * Flattens tokenColors into one entry per selector.
 * A rule without scope is the global rule (default editor foreground/background).
 */
export function normalizeRules(tokenColors = []) {
  const rules = [];
  let globalDefaults = {};
  tokenColors.forEach((rule, index) => {
    const settings = rule.settings || {};
    const scope = rule.scope;
    const empty = scope === undefined || scope === null || (Array.isArray(scope) ? scope.length === 0 : String(scope).trim() === '');
    if (empty) {
      globalDefaults = { ...globalDefaults, ...settings };
      return;
    }
    const selectors = Array.isArray(scope) ? scope : String(scope).split(',');
    for (const raw of selectors) {
      const selector = String(raw).trim();
      if (!selector) continue;
      const [positive, ...excluded] = selector.split(/\s+-\s+/);
      rules.push({
        selector,
        parts: positive.trim().split(/\s+/),
        exclude: excluded.map((e) => e.trim().split(/\s+/)).filter((e) => e[0]),
        foreground: settings.foreground,
        background: settings.background,
        fontStyle: settings.fontStyle, // "" resets; undefined leaves it unset
        order: index,
      });
    }
  });
  return { rules, globalDefaults };
}

const segments = (s) => s.split('.').length;

/** "keyword" matches "keyword" and "keyword.control.js"; "key" does not match "keyword". */
export function segmentPrefixMatch(p, s) {
  return s === p || s.startsWith(`${p}.`);
}

/** Returns a score tuple when `parts` matches `stack` (last part on the innermost scope), else null. */
export function matchSelector(parts, stack) {
  if (!stack.length || !segmentPrefixMatch(parts[parts.length - 1], stack[stack.length - 1])) return null;
  let i = stack.length - 2;
  for (let j = parts.length - 2; j >= 0; j--) {
    while (i >= 0 && !segmentPrefixMatch(parts[j], stack[i])) i--;
    if (i < 0) return null;
    i--;
  }
  let ancestorSegments = 0;
  for (let j = 0; j < parts.length - 1; j++) ancestorSegments += segments(parts[j]);
  return [segments(parts[parts.length - 1]), parts.length, ancestorSegments];
}

function excluded(rule, stack) {
  return rule.exclude.some((ex) => ex.every((p) => stack.some((s) => segmentPrefixMatch(p, s))));
}

function compareScore(a, b) {
  for (let k = 0; k < Math.max(a.length, b.length); k++) {
    const d = (a[k] ?? 0) - (b[k] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * Resolves foreground, fontStyle and background independently (TextMate semantics):
 * a rule that only sets fontStyle does not erase a color coming from another rule.
 */
export function resolve(stack, rules, globalDefaults = {}) {
  const candidates = [];
  for (const r of rules) {
    const score = matchSelector(r.parts, stack);
    if (score && !excluded(r, stack)) candidates.push({ r, score });
  }
  candidates.sort((x, y) => compareScore(x.score, y.score) || x.r.order - y.r.order);
  const last = (prop) => {
    for (let k = candidates.length - 1; k >= 0; k--) {
      if (candidates[k].r[prop] !== undefined) return candidates[k].r;
    }
    return null;
  };
  const fg = last('foreground');
  const fs = last('fontStyle');
  const bg = last('background');
  return {
    foreground: fg ? fg.foreground : globalDefaults.foreground,
    fontStyle: fs ? fs.fontStyle : '',
    background: bg ? bg.background : null,
    matched: { foreground: fg?.selector ?? null, fontStyle: fs?.selector ?? null, background: bg?.selector ?? null },
    matchedAny: candidates.length > 0,
    usedGlobal: !fg,
  };
}

/** IntelliJ FONT_TYPE: 0 plain, 1 bold, 2 italic, 3 bold+italic. */
export function fontType(fontStyle = '') {
  const words = String(fontStyle).split(/\s+/);
  return (words.includes('bold') ? 1 : 0) + (words.includes('italic') ? 2 : 0);
}

export function fontEffects(fontStyle = '') {
  const words = String(fontStyle).split(/\s+/);
  return { underline: words.includes('underline'), strikethrough: words.includes('strikethrough') };
}
