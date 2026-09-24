// RFC 4180 CSV writing. The reader lives in marketing/sheets/Code.gs (it has to run inside Apps
// Script), and test/qa-tracker-sheets.test.js round-trips this writer through that reader.
//
// Retailer strings are written exactly as listed: product names contain commas ("Butter, Salted"),
// inch and foot marks ('18" x 500\''), and occasionally line breaks. Any field containing a comma,
// a double quote, a CR or an LF — or starting or ending with a space, which some readers trim —
// is quoted, with inner quotes doubled.

export function csvField(v) {
  if (v == null) return '';
  let s;
  if (typeof v === 'boolean') s = v ? 'TRUE' : 'FALSE';
  else if (typeof v === 'number') s = Number.isFinite(v) ? String(v) : '';
  else s = String(v);
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** rows: array of objects; columns: the header, in order. Lines end CRLF as RFC 4180 says. */
export function toCsv(columns, rows) {
  const lines = [columns.map(csvField).join(',')];
  for (const r of rows) lines.push(columns.map((c) => csvField(r[c])).join(','));
  return lines.join('\r\n') + '\r\n';
}
