// Mini expression language shared by mappings and overrides.
//
//   expr        := alternative ( "|" alternative )*      first alternative that resolves wins
//   alternative := source modifier*
//   source      := "@<vscode-color-key>"                   color of the current variant
//                | "@syntax:<INTELLIJ_ATTRIBUTE_KEY>"      foreground already resolved for that key
//                | "@scope:<scope> <scope> ..."            foreground the tokenColors give to that scope stack
//                | "#RRGGBB[AA]" | "RRGGBB[AA]"            literal (avoid; prefer overrides with _notes)
//   modifier    := "~NN"   set opacity to NN%
//                | ">NN"   lighten NN points (HSL)
//                | "<NN"   darken NN points (HSL)
import { parseColor, withOpacity, adjustLightness } from './color.js';

const ALT_RE = /^(.*?)((?:[~<>]\d+(?:\.\d+)?)*)$/;

/**
 * @param {string} expr
 * @param {object} ctx { colors, syntax(key) -> color|undefined, scope(stack[]) -> color|undefined, where }
 * @returns {{color: object, source: string} | undefined}
 */
export function evaluate(expr, ctx) {
  for (const raw of String(expr).split('|')) {
    const alt = raw.trim();
    const m = alt.match(ALT_RE);
    if (!m) continue;
    const [, src, mods] = m;
    let color = source(src.trim(), ctx);
    if (!color) continue;
    for (const mod of mods.match(/[~<>]\d+(?:\.\d+)?/g) || []) {
      const n = Number(mod.slice(1));
      if (mod[0] === '~') color = withOpacity(color, n);
      else if (mod[0] === '>') color = adjustLightness(color, n);
      else color = adjustLightness(color, -n);
    }
    return { color, source: alt };
  }
  return undefined;
}

function source(src, ctx) {
  const where = ctx.where ? ` (${ctx.where})` : '';
  if (src.startsWith('@syntax:')) return ctx.syntax?.(src.slice(8));
  if (src.startsWith('@scope:')) return ctx.scope?.(src.slice(7).trim().split(/\s+/));
  if (src.startsWith('@')) {
    const v = ctx.colors[src.slice(1)];
    return v === undefined ? undefined : parseColor(v, `${src.slice(1)}${where}`);
  }
  if (/^#?[0-9a-fA-F]{3,8}$/.test(src)) return parseColor(src, `literal${where}`);
  throw new Error(`invalid expression "${src}"${where}`);
}

/** True when the expression references a literal color (used to flag hand-written colors). */
export function hasLiteral(expr) {
  return String(expr).split('|').some((alt) => /^#?[0-9a-fA-F]{3,8}(?:[~<>]|$)/.test(alt.trim()));
}
