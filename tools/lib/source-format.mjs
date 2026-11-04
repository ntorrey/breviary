// Parser for the plain-text content source format (see docs/CONTENT-FORMAT.md).
//
//   %% a comment line
//   === psalter/w1/sun/mp          <- start an entry (content key)
//   --- hymn                       <- start a field
//   text of the field...
//   --- reading
//   @ref Romans 13:11b-12          <- @-lines at the top of a field become properties
//   It is now the hour for you to wake from sleep...

export function parseSource(text, file = '<input>') {
  const entries = {};
  const warnings = [];
  let key = null;
  let field = null;
  let buf = [];
  let lineNo = 0;

  const flush = () => {
    if (key && field) {
      const value = parseValue(buf);
      if (value !== null) {
        if (entries[key][field] !== undefined) warnings.push(`${file}:${lineNo}: duplicate field "${field}" in ${key}`);
        entries[key][field] = value;
      }
    }
    field = null;
    buf = [];
  };

  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    lineNo++;
    if (raw.startsWith('%%')) continue;
    const e = raw.match(/^===\s*(\S+)\s*$/);
    if (e) { flush(); key = e[1]; entries[key] ||= {}; continue; }
    const f = raw.match(/^---\s*(\S+)\s*$/);
    if (f) {
      flush();
      if (!key) { warnings.push(`${file}:${lineNo}: field "${f[1]}" before any === entry`); continue; }
      field = f[1];
      continue;
    }
    if (field) buf.push(raw);
    else if (raw.trim()) warnings.push(`${file}:${lineNo}: text outside a field ignored`);
  }
  flush();
  return { entries, warnings };
}

function parseValue(lines) {
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!lines.length) return null;
  const props = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^@(\w+)\s*(.*)$/);
    if (!m) break;
    props[m[1]] = m[2] === 'true' ? true : m[2] === 'false' ? false : m[2];
  }
  const text = lines.slice(i).join('\n').replace(/^\n+/, '');
  if (!Object.keys(props).length) return text;
  if (text) props.text = text;
  return props;
}

/** Which shard file an entry key belongs in. */
export function shardPrefix(key) {
  const parts = key.split('/');
  if (['psalter', 'time', 'saints', 'commons'].includes(parts[0]) && parts.length > 2) return parts.slice(0, 2).join('/');
  return parts[0];
}
