/** RFC 4180 CSV that opens cleanly in Google Sheets and Excel. */
export function csvCell(value: unknown): string {
  if (value == null) return "";
  let s = Array.isArray(value) ? value.join("; ") : String(value);
  // Stop spreadsheets from treating text as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
