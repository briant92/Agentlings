import { describe, expect, it } from 'vitest';
import { attachmentShape, inputShapeOf, sameInputShape } from './inputshape';

describe('attachmentShape (D-221)', () => {
  it('names a spreadsheet-shaped text file by its header, normalised', () => {
    const csv = 'Date,Description,Check No,Debit,Credit,Balance\n2026-09-01,Opening balance,,,,20000.00\n';
    expect(attachmentShape('bank-statement.csv', Buffer.from(csv))).toBe(
      'csv:date|description|check no|debit|credit|balance',
    );
  });

  it('reads a semicolon file with a BOM, quotes and accents the way a bank writes it', () => {
    const cartola =
      '\uFEFF"Fecha";"Descripción";"N° Documento";Cargo;Abono;Saldo\r\n01/05/2026;SALDO ANTERIOR;;;;3000000\r\n';
    expect(attachmentShape('cartola.csv', Buffer.from(cartola))).toBe(
      'csv:fecha|descripcion|n° documento|cargo|abono|saldo',
    );
  });

  it('tells a tab file from a comma file, and prose from a table', () => {
    expect(attachmentShape('rows.tsv', Buffer.from('a\tb\tc\n1\t2\t3\n'))).toBe('tsv:a|b|c');
    // One line with one comma is a sentence, not a two-column table.
    expect(attachmentShape('brief.txt', Buffer.from('Please reconcile this, and quickly.\n'))).toBe(
      'txt:prose',
    );
    // A second line that does not split the same way is prose too.
    expect(
      attachmentShape('notes.txt', Buffer.from('Totals, by month\nJanuary was fine, February, March were not\n')),
    ).toBe('txt:prose');
    // A bank's .txt export is a table and reads as one.
    expect(attachmentShape('export.txt', Buffer.from('Fecha;Glosa;Monto\n01/05/2026;x;1\n'))).toBe(
      'txt:fecha|glosa|monto',
    );
  });

  it('names anything else by its extension alone, binary bytes included', () => {
    expect(attachmentShape('book.xlsx', Buffer.from('PK'))).toBe('ext:xlsx');
    expect(attachmentShape('scan.PDF', Buffer.from('%PDF-1.7\n'))).toBe('ext:pdf');
    expect(attachmentShape('README', Buffer.from('hello'))).toBe('ext:none');
    expect(attachmentShape('data.csv', Buffer.from([0x00, 0x01, 0x02]))).toBe('ext:csv');
  });
});

describe('inputShapeOf and sameInputShape (D-221)', () => {
  it('sets a job\'s shape from its attachments, sorted, deduplicated, absent when there are none', () => {
    expect(inputShapeOf(undefined)).toBeUndefined();
    expect(inputShapeOf([])).toBeUndefined();
    expect(
      inputShapeOf([
        { name: 'b.csv', shape: 'csv:b' },
        { name: 'a.csv', shape: 'csv:a' },
        { name: 'c.csv', shape: 'csv:a' },
      ]),
    ).toEqual(['csv:a', 'csv:b']);
    // Stamped before shapes existed: the extension is all its record says.
    expect(inputShapeOf([{ name: 'old.pdf' }])).toEqual(['ext:pdf']);
  });

  it('matches shapes the way the learning needs', () => {
    expect(sameInputShape(undefined, undefined)).toBe(true); // no files, learned with none
    expect(sameInputShape(undefined, ['csv:a'])).toBe(false); // unknown provenance, attached job
    expect(sameInputShape(['csv:a'], undefined)).toBe(false); // learned over files, asked about none
    expect(sameInputShape(['csv:b', 'csv:a'], ['csv:a', 'csv:b'])).toBe(true);
    expect(sameInputShape(['csv:a'], ['csv:a', 'csv:b'])).toBe(false);
    expect(sameInputShape(['csv:a'], ['csv:b'])).toBe(false);
  });
});
