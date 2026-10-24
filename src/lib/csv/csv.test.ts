import { describe, expect, it } from 'vitest';
import { decodeUtf8, guardFormula, parseCsv, toCsv, unguardFormula } from './csv';

const ok = (text: string) => {
  const r = parseCsv(text);
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe('parseCsv', () => {
  it('reads a header and rows with physical line numbers', () => {
    const r = ok('a,b\r\n1,2\r\n3,4\r\n');
    expect(r.header).toEqual(['a', 'b']);
    expect(r.rows).toEqual([
      { line: 2, cells: ['1', '2'] },
      { line: 3, cells: ['3', '4'] },
    ]);
  });

  it('handles quotes, escaped quotes, commas and newlines inside quoted cells', () => {
    const r = ok('a,b\n"x, ""y""","line1\nline2"\nnext,row\n');
    expect(r.rows[0]!.cells).toEqual(['x, "y"', 'line1\nline2']);
    expect(r.rows[1]).toEqual({ line: 4, cells: ['next', 'row'] }); // the quoted newline is counted
  });

  it('accepts LF, CRLF and bare CR, a BOM-free final line, and skips blank lines', () => {
    expect(ok('a\n1\n\n2').rows.map((r) => r.cells[0])).toEqual(['1', '2']);
    expect(ok('a\r1\r2\r').rows.map((r) => r.cells[0])).toEqual(['1', '2']);
  });

  it('keeps empty cells (empty is not zero) and trailing empty cells', () => {
    expect(ok('a,b,c\n1,,\n,,').rows.map((r) => r.cells)).toEqual([['1', '', ''], ['', '', '']]);
  });

  it('distinguishes a quoted empty cell row from a blank line', () => {
    expect(ok('a\n""\n').rows).toHaveLength(1);
  });

  it('rejects malformed quoting', () => {
    expect(parseCsv('a,b\n"open,1')).toMatchObject({ ok: false });
    expect(parseCsv('a\nx"y')).toMatchObject({ ok: false });
    expect(parseCsv('a\n"x"y')).toMatchObject({ ok: false });
  });

  it('enforces row and cell limits and rejects NUL bytes', () => {
    const limits = { maxBytes: 100, maxRows: 2, maxCellLength: 5 };
    expect(parseCsv('a\n1\n2\n3\n', limits)).toMatchObject({ ok: false, error: expect.stringMatching(/Terlalu banyak baris/) });
    expect(parseCsv('a\ntoolongvalue', limits)).toMatchObject({ ok: false, error: expect.stringMatching(/lebih dari 5 karakter/) });
    expect(parseCsv('a\n\u0000')).toMatchObject({ ok: false });
  });

  it('reports a file with no header', () => {
    expect(parseCsv('')).toMatchObject({ ok: false });
    expect(parseCsv('\n\n')).toMatchObject({ ok: false });
  });
});

describe('decodeUtf8', () => {
  const enc = (s: string) => new TextEncoder().encode(s);

  it('strips a BOM and decodes UTF-8', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...enc('é,ü')]);
    expect(decodeUtf8(bytes)).toEqual({ ok: true, text: 'é,ü' });
  });

  it('rejects invalid UTF-8, empty and oversized files', () => {
    expect(decodeUtf8(new Uint8Array([0xff, 0xfe, 0xfa]))).toMatchObject({ ok: false, error: expect.stringMatching(/UTF-8/) });
    expect(decodeUtf8(new Uint8Array(0))).toMatchObject({ ok: false });
    expect(decodeUtf8(new Uint8Array(11), 10)).toMatchObject({ ok: false, error: expect.stringMatching(/terlalu besar/) });
  });
});

describe('formula injection protection', () => {
  it.each(['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx', '\rx', '=HYPERLINK("http://evil","x")'])('guards %j', (s) => {
    expect(guardFormula(s).startsWith("'")).toBe(true);
    expect(unguardFormula(guardFormula(s))).toBe(s);
  });

  it('leaves ordinary text alone', () => {
    for (const s of ['hello', "it's fine", "'quoted", '', 'a=b', '5-3']) {
      expect(guardFormula(s)).toBe(s);
      expect(unguardFormula(s)).toBe(s);
    }
  });

  it('round-trips text that already starts with apostrophes before a dangerous character', () => {
    for (const s of ["'=x", "''-1", "'@a"]) expect(unguardFormula(guardFormula(s))).toBe(s);
  });

  it('is an exact inverse for arbitrary strings (property test)', () => {
    const alphabet = ["'", '=', '+', '-', '@', '\t', '\r', '\n', 'a', ' ', '"', ',', '1'];
    let seed = 42;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let i = 0; i < 2000; i++) {
      const s = Array.from({ length: Math.floor(rnd() * 6) }, () => alphabet[Math.floor(rnd() * alphabet.length)]).join('');
      expect(unguardFormula(guardFormula(s))).toBe(s);
    }
  });

  it('survives a full CSV round trip including quotes, commas and newlines', () => {
    const values = ['=1+1', 'say "hi", please', 'two\nlines', "'=x", '-5 apples', ''];
    const csv = toCsv([['id', 'text'], ...values.map((v, i) => [String(i), guardFormula(v)])]);
    const parsed = ok(csv);
    expect(parsed.rows.map((r) => unguardFormula(r.cells[1]!))).toEqual(values);
    expect(csv).not.toMatch(/(^|,)=1\+1/m); // the dangerous cell is neutralised in the file itself
  });
});

describe('toCsv', () => {
  it('quotes only where needed and ends lines with CRLF', () => {
    expect(toCsv([['a', 'b,c'], ['"q"', 'n\nl']])).toBe('a,"b,c"\r\n"""q""","n\nl"\r\n');
  });
});
