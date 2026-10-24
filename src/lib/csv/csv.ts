/**
 * Minimal, strict CSV (RFC 4180) reader/writer plus spreadsheet-formula protection.
 * All input is untrusted: size, row count and cell length are capped, encoding must be valid UTF-8,
 * and nothing here evaluates, fetches or follows cell contents.
 */

export interface CsvLimits {
  maxBytes: number;
  maxRows: number;
  maxCellLength: number;
}

export const DEFAULT_CSV_LIMITS: CsvLimits = { maxBytes: 2 * 1024 * 1024, maxRows: 5000, maxCellLength: 5000 };

export interface CsvRecord {
  /** 1-based physical line where the record starts (quoted newlines are counted). */
  line: number;
  cells: string[];
}

export type CsvParseResult =
  | { ok: true; header: string[]; rows: CsvRecord[] }
  | { ok: false; error: string };

export function decodeUtf8(bytes: Uint8Array, maxBytes = DEFAULT_CSV_LIMITS.maxBytes): { ok: true; text: string } | { ok: false; error: string } {
  if (bytes.byteLength === 0) return { ok: false, error: 'File kosong.' };
  if (bytes.byteLength > maxBytes) {
    return { ok: false, error: `File terlalu besar (maksimal ${Math.round(maxBytes / 1024 / 1024)} MB).` };
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { ok: true, text: text.charCodeAt(0) === 0xfeff ? text.slice(1) : text };
  } catch {
    return { ok: false, error: 'Encoding tidak valid: simpan file sebagai CSV UTF-8.' };
  }
}

export function parseCsv(text: string, limits: CsvLimits = DEFAULT_CSV_LIMITS): CsvParseResult {
  if (text.includes('\u0000')) return { ok: false, error: 'File mengandung karakter NUL; bukan CSV teks.' };

  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  let afterQuote = false; // just closed a quoted field
  let line = 1;
  let recordLine = 1;
  let started = false; // current record has any content

  const endCell = () => {
    if (cell.length > limits.maxCellLength) throw new CsvError(`Sel pada baris ${recordLine} lebih dari ${limits.maxCellLength} karakter.`);
    cells.push(cell);
    cell = '';
    afterQuote = false;
  };
  const endRecord = () => {
    endCell();
    const blank = cells.length === 1 && cells[0] === '' && !started;
    if (!blank) {
      records.push({ line: recordLine, cells });
      if (records.length > limits.maxRows + 1) throw new CsvError(`Terlalu banyak baris (maksimal ${limits.maxRows}).`);
    }
    cells = [];
    started = false;
  };

  try {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!;
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i++;
          } else {
            inQuotes = false;
            afterQuote = true;
          }
        } else {
          if (ch === '\n') line++;
          cell += ch;
        }
        continue;
      }
      if (ch === '"') {
        if (cell !== '' || afterQuote) throw new CsvError(`Tanda kutip tidak pada tempatnya di baris ${line}.`);
        inQuotes = true;
        started = true;
        continue;
      }
      if (afterQuote && ch !== ',' && ch !== '\n' && ch !== '\r') {
        throw new CsvError(`Karakter setelah tanda kutip penutup di baris ${line}.`);
      }
      if (ch === ',') {
        started = true;
        endCell();
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        endRecord();
        line++;
        recordLine = line;
      } else {
        started = true;
        cell += ch;
      }
    }
    if (inQuotes) throw new CsvError(`Tanda kutip dibuka di baris ${recordLine} tetapi tidak pernah ditutup.`);
    if (cell !== '' || cells.length > 0 || started) endRecord();
  } catch (e) {
    if (e instanceof CsvError) return { ok: false, error: e.message };
    throw e;
  }

  const [header, ...rows] = records;
  if (!header) return { ok: false, error: 'File tidak punya baris header.' };
  return { ok: true, header: header.cells.map((h) => h.trim()), rows };
}

class CsvError extends Error {}

// --- writing ---

/** Characters that make spreadsheets treat a cell as a formula (OWASP CSV injection): = + - @ tab CR LF. */
const DANGEROUS = /^'*[=+\-@\t\r\n]/;
const ESCAPED = /^'+[=+\-@\t\r\n]/;

/**
 * Protects TEXT cells against formula injection by prefixing an apostrophe. Cells that already start
 * with apostrophes followed by a dangerous character get one more, so `unguardFormula` is an exact
 * inverse (lossless round trip). Do NOT apply to numeric cells: "-5" must stay "-5".
 */
export function guardFormula(text: string): string {
  return DANGEROUS.test(text) ? `'${text}` : text;
}

export function unguardFormula(text: string): string {
  return ESCAPED.test(text) ? text.slice(1) : text;
}

export function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Rows → CSV text with CRLF line endings and a trailing newline. */
export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
