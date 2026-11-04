// Converts assembled blocks into HTML.
//
// Lightweight text markup used in the content files:
//   blank line        new stanza / paragraph
//   two-space indent  indented line (second half of a psalm verse)
//   V/ ...            versicle  (℣.)
//   R/ ...            response  (℟.)
//   ! ...             rubric (printed red, italic)
//   *  and  †         mediant and flex marks (printed red)
//   _text_            italics

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function inline(s) {
  return escapeHtml(s)
    .replace(/\s+\*(?=\s|$)/g, '&nbsp;<span class="mark">*</span>')
    .replace(/^\*(?=\s|$)/g, '<span class="mark">*</span>')
    .replace(/\s*†/g, '&nbsp;<span class="mark">†</span>')
    .replace(/_([^_]+)_/g, '<em>$1</em>');
}

export function markupToHtml(text) {
  const stanzas = String(text ?? '').replace(/\r\n/g, '\n').trim().split(/\n\s*\n/);
  return stanzas.map((st) => {
    const lines = st.split('\n').map((line) => {
      if (/^!\s?/.test(line)) return `<span class="rubric">${inline(line.replace(/^!\s?/, ''))}</span>`;
      const m = line.match(/^(\s*)(V\/|R\/)\s?(.*)$/);
      if (m) {
        const sym = m[2] === 'V/' ? '℣.' : '℟.';
        return `<span class="vr"><span class="mark">${sym}</span> ${inline(m[3])}</span>`;
      }
      if (/^\s{2,}/.test(line)) return `<span class="indent">${inline(line.trim())}</span>`;
      return `<span class="line">${inline(line)}</span>`;
    });
    return `<p class="stanza">${lines.join('')}</p>`;
  }).join('');
}

const srcTag = (b) => (b.src ? `<div class="src">${escapeHtml(b.src)}</div>` : '');

export function blocksToHtml(blocks) {
  return blocks.map((b) => {
    switch (b.k) {
      case 'heading':
        return `<h3 class="part">${escapeHtml(b.text)}</h3>`;
      case 'rubric':
        return `<p class="rubric block">${escapeHtml(b.text)}</p>`;
      case 'text':
        return `<div class="text ${b.cls || ''}">${markupToHtml(b.text)}${srcTag(b)}</div>`;
      case 'antiphon':
        return `<div class="antiphon${b.repeat ? ' repeat' : ''}"><span class="label">${escapeHtml(b.label)}</span> ${inline(b.text)}${srcTag(b)}</div>`;
      case 'psalm':
        return `<div class="psalm">
          ${b.title ? `<h4 class="psalm-title">${escapeHtml(b.title)}</h4>` : ''}
          ${b.subtitle ? `<p class="psalm-subtitle">${inline(b.subtitle)}</p>` : ''}
          ${markupToHtml(b.text)}${srcTag(b)}
        </div>`;
      case 'reading':
        return `<h3 class="part">${escapeHtml(b.label)}</h3>
          <div class="reading">
          ${b.ref ? `<p class="ref">${escapeHtml(b.ref)}</p>` : ''}
          ${b.author ? `<p class="author">${escapeHtml(b.author)}</p>` : ''}
          ${b.title ? `<p class="reading-title">${escapeHtml(b.title)}</p>` : ''}
          ${markupToHtml(b.text)}${srcTag(b)}
        </div>`;
      case 'missing':
        return `<details class="missing">
          <summary><span class="missing-label">${escapeHtml(b.label)}</span> — text not yet loaded</summary>
          <p>Looked in, in order:</p>
          <ol>${(b.tried || []).map((t) => `<li><code>${escapeHtml(t)}</code></li>`).join('')}</ol>
        </details>`;
      default:
        return '';
    }
  }).join('\n');
}
