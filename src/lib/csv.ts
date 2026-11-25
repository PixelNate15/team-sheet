/**
 * Reading a player list exported from a spreadsheet or another system.
 *
 * Accepts comma, semicolon or tab separators, quoted fields ("Smith, Jr"),
 * a header row in any order (first name / surname / email / team) or, with
 * no recognisable header, columns in that order.
 */

export interface ImportRow {
  line: number;
  first_name: string;
  surname: string;
  email: string;
  team: string;
  /** Why this row can't be imported, if anything. */
  problem: string | null;
}

const HEADERS: Record<keyof Omit<ImportRow, 'line' | 'problem'>, RegExp> = {
  first_name: /^(first ?name|forename|given ?name|first)$/,
  surname: /^(surname|last ?name|family ?name|last)$/,
  email: /^(e[ -]?mail( address)?)$/,
  team: /^(team|squad)$/,
};
const FULL_NAME = /^(name|full ?name|player)$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Split CSV text into rows of fields, honouring quotes. */
export function splitCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const sep = [',', ';', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((f) => f.trim())).filter((r) => r.some((f) => f !== ''));
}

/** Turn CSV text into rows ready to import, flagging problems per row. */
export function parsePlayerCsv(text: string): ImportRow[] {
  const rows = splitCsv(text);
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.toLowerCase().replace(/[_-]+/g, ' ').trim());
  const col = (k: keyof typeof HEADERS) => header.findIndex((h) => HEADERS[k].test(h));
  const fullCol = header.findIndex((h) => FULL_NAME.test(h));
  const hasHeader = col('email') !== -1;
  const idx = hasHeader
    ? { first_name: col('first_name'), surname: col('surname'), email: col('email'), team: col('team') }
    : { first_name: 0, surname: 1, email: 2, team: 3 };

  const seen = new Set<string>();
  return rows.slice(hasHeader ? 1 : 0).map((r, i) => {
    const get = (j: number) => (j >= 0 ? (r[j] ?? '').trim() : '');
    let first = get(idx.first_name);
    let surname = get(idx.surname);
    // A single "Name" column: split on the last space.
    if (hasHeader && idx.first_name === -1 && fullCol !== -1) {
      const full = get(fullCol).replace(/\s+/g, ' ');
      const cut = full.lastIndexOf(' ');
      first = cut > 0 ? full.slice(0, cut) : full;
      surname = cut > 0 ? full.slice(cut + 1) : '';
    }
    const email = get(idx.email).toLowerCase();
    let problem: string | null = null;
    if (!EMAIL.test(email)) problem = email ? 'Email address doesn’t look right' : 'No email address';
    else if (seen.has(email)) problem = 'Listed twice';
    seen.add(email);
    return {
      line: i + (hasHeader ? 2 : 1),
      first_name: first.slice(0, 50),
      surname: surname.slice(0, 50),
      email,
      team: get(idx.team),
      problem,
    };
  });
}
