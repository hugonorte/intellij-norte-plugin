// Minimal XML helpers for IntelliJ editor color schemes.

export function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const ATTR_ORDER = ['FOREGROUND', 'BACKGROUND', 'FONT_TYPE', 'EFFECT_COLOR', 'EFFECT_TYPE', 'ERROR_STRIPE_COLOR'];

const byOrder = (a, b) => {
  const ia = ATTR_ORDER.indexOf(a), ib = ATTR_ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a < b ? -1 : a > b ? 1 : 0);
};

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * @param {{name: string, parentScheme: string, colors: Record<string,string>,
 *          attributes: Record<string, Record<string, string|number> | {baseAttributes: string}>}} scheme
 */
export function serializeScheme({ name, parentScheme, colors, attributes }) {
  const lines = [];
  lines.push(`<scheme name="${escapeXml(name)}" version="142" parent_scheme="${escapeXml(parentScheme)}">`);
  lines.push('  <colors>');
  for (const k of Object.keys(colors).sort(cmp)) {
    lines.push(`    <option name="${escapeXml(k)}" value="${escapeXml(colors[k])}" />`);
  }
  lines.push('  </colors>');
  lines.push('  <attributes>');
  for (const k of Object.keys(attributes).sort(cmp)) {
    const a = attributes[k];
    if (a.baseAttributes) {
      lines.push(`    <option name="${escapeXml(k)}" baseAttributes="${escapeXml(a.baseAttributes)}" />`);
      continue;
    }
    lines.push(`    <option name="${escapeXml(k)}">`);
    lines.push('      <value>');
    for (const p of Object.keys(a).sort(byOrder)) {
      lines.push(`        <option name="${escapeXml(p)}" value="${escapeXml(a[p])}" />`);
    }
    lines.push('      </value>');
    lines.push('    </option>');
  }
  lines.push('  </attributes>');
  lines.push('</scheme>');
  return lines.join('\n') + '\n';
}
