// Minimal RFC 4180 CSV: quoted fields, escaped quotes, CRLF/LF, newlines inside quotes.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') field += '"', i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(field), field = '';
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field), rows.push(row), row = [], field = '';
    } else field += c;
  }
  if (field !== '' || row.length) row.push(field), rows.push(row);
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

// Spreadsheet apps execute cells starting with = + - @; prefix them so exports are safe to open.
const cell = (v) => {
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows, columns = rows[0] ? Object.keys(rows[0]) : []) {
  return [columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n';
}
