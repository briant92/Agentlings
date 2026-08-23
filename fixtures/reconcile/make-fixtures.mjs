// Generic reconciliation fixtures for the B0 trial — no proprietary data.
//
// Two published, attributed exercises expanded to line level, with their own
// solutions kept beside them (never attached to a job):
//
//   us/     "My Company" bank reconciliation, September 30 — Lumen Learning,
//           Financial Accounting (SUNY), "Preparing a Bank Reconciliation",
//           CC BY 4.0; originally from Edwards & Hermanson, Accounting
//           Principles: A Business Perspective. Item-level in the source:
//           bank $27,395, book $24,457, deposit in transit $6,700,
//           outstanding checks #2004 $1,000 / #2008 $650 / #2009 $200 /
//           #2012 $5,500, interest $3, note collected $3,500 less $500 fee,
//           NSF $350, service charge $5, check #2005 recorded $5,483 and
//           paid $5,843; both sides adjust to $26,745.
//   cl/     Conciliación bancaria al 31 de mayo de 2026 — Edig (edig.cl),
//           "¿Qué es la conciliación bancaria en Chile? Guía paso a paso con
//           ejemplo". Item-level in the source: libro mayor banco
//           $4.250.000, cartola $4.118.500, intereses +8.500, comisión
//           mantención −15.000, IVA comisión −2.850, depósito en tránsito
//           +242.150, transferencia a proveedor emitida no procesada
//           −120.000; ambos lados concilian en $4.240.650.
//
// The filler lines (the ones that match on both sides) are invented here so
// the month adds up to the published balances; the script asserts that it
// does, so a fixture that drifts from its source refuses to be written.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const out = (rel, text) => {
  const file = path.join(HERE, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  console.log('wrote', rel);
};
const assertEq = (label, got, want) => {
  if (Math.abs(got - want) > 0.005) throw new Error(`${label}: got ${got}, want ${want}`);
};

// ---------------------------------------------------------------- US ---------
{
  const usd = (n) => n.toFixed(2);
  // Book side: the company's own cash ledger (what the user keeps).
  const book = [
    ['2026-09-01', 'BAL', 'Opening balance', 0, 0],
    ['2026-09-02', 'DEP', 'Deposit — daily receipts', 4200, 0],
    ['2026-09-03', '2001', 'Ridge Supply Co.', 0, 1200],
    ['2026-09-05', '2002', 'Metro Leasing — September rent', 0, 2450],
    ['2026-09-08', 'DEP', 'Deposit — daily receipts', 3850, 0],
    ['2026-09-09', '2003', 'Northside Utilities', 0, 975],
    ['2026-09-11', '2004', 'Harbor Insurance', 0, 1000],
    ['2026-09-12', '2005', 'Office Depot — equipment', 0, 5483],
    ['2026-09-15', 'DEP', 'Deposit — daily receipts', 5120, 0],
    ['2026-09-16', '2006', 'Payroll — period ending 9/15', 0, 3300],
    ['2026-09-18', '2007', 'Lakeside Printing', 0, 1100],
    ['2026-09-22', 'DEP', 'Deposit — daily receipts', 2980, 0],
    ['2026-09-23', '2008', 'Crown Cleaning Services', 0, 650],
    ['2026-09-24', '2009', 'City Parking Authority', 0, 200],
    ['2026-09-25', '2010', 'Fairview Telecom', 0, 845],
    ['2026-09-26', 'DEP', 'Deposit — daily receipts', 6000, 0],
    ['2026-09-29', '2011', 'Ridge Supply Co.', 0, 1690],
    ['2026-09-30', '2012', 'Payroll — period ending 9/30', 0, 5500],
    ['2026-09-30', 'DEP', 'Deposit — daily receipts (night drop)', 6700, 0],
  ];
  // Bank side: what the statement shows. Same cleared items, plus the bank's
  // own lines, minus what had not reached it by the 30th.
  const bank = [
    ['2026-09-01', 'Opening balance', '', 0, 0],
    ['2026-09-02', 'Deposit', '', 0, 4200],
    ['2026-09-05', 'Check', '2001', 1200, 0],
    ['2026-09-08', 'Deposit', '', 0, 3850],
    ['2026-09-09', 'Check', '2002', 2450, 0],
    ['2026-09-12', 'Check', '2003', 975, 0],
    ['2026-09-15', 'Deposit', '', 0, 5120],
    ['2026-09-17', 'Check', '2005', 5843, 0],
    ['2026-09-18', 'Check', '2006', 3300, 0],
    ['2026-09-19', 'Returned check — NSF — J. Doe', '', 350, 0],
    ['2026-09-22', 'Deposit', '', 0, 2980],
    ['2026-09-23', 'Check', '2007', 1100, 0],
    ['2026-09-25', 'Note collected — Acme Co.', '', 0, 3500],
    ['2026-09-25', 'Collection fee', '', 500, 0],
    ['2026-09-26', 'Deposit', '', 0, 6000],
    ['2026-09-29', 'Check', '2010', 845, 0],
    ['2026-09-30', 'Check', '2011', 1690, 0],
    ['2026-09-30', 'Service charge', '', 5, 0],
    ['2026-09-30', 'Interest', '', 0, 3],
  ];
  const OPEN = 20000;
  let b = OPEN;
  const bookRows = book.map(([d, ref, desc, dep, wd]) => {
    b += dep - wd;
    return [d, ref, desc, dep ? usd(dep) : '', wd ? usd(wd) : '', usd(b)].join(',');
  });
  let k = OPEN;
  const bankRows = bank.map(([d, desc, chk, debit, credit]) => {
    k += credit - debit;
    return [d, desc, chk, debit ? usd(debit) : '', credit ? usd(credit) : '', usd(k)].join(',');
  });
  assertEq('US book ending', b, 24457);
  assertEq('US bank ending', k, 27395);
  out(
    'us/bank-statement-2026-09.csv',
    ['Date,Description,Check No,Debit,Credit,Balance', ...bankRows].join('\n') + '\n',
  );
  out(
    'us/cash-ledger-2026-09.csv',
    ['Date,Ref,Description,Deposit,Withdrawal,Balance', ...bookRows].join('\n') + '\n',
  );
  out(
    'us/SOLUTION.md',
    `# Expected reconciliation — My Company, September 30, 2026

Source: Lumen Learning, *Financial Accounting* (SUNY), "Preparing a Bank
Reconciliation" (CC BY 4.0), after Edwards & Hermanson. Filler lines invented
to reach the published balances; kept OUT of the job's attachments.

Bank statement balance 27,395.00 · Book balance 24,457.00

| Bank side | | Book side | |
|---|---|---|---|
| Ending bank balance | 27,395.00 | Ending book balance | 24,457.00 |
| + Deposit in transit 9/30 | 6,700.00 | + Interest | 3.00 |
| − Outstanding checks 2004, 2008, 2009, 2012 | (7,350.00) | + Note collected 3,500 less 500 fee | 3,000.00 |
| | | − Service charge | (5.00) |
| | | − NSF check J. Doe | (350.00) |
| | | − Check 2005 recorded 5,483, paid 5,843 | (360.00) |
| **Adjusted** | **26,745.00** | **Adjusted** | **26,745.00** |

Matched on both sides: deposits 4,200 / 3,850 / 5,120 / 2,980 / 6,000 and
checks 2001, 2002, 2003, 2006, 2007, 2010, 2011. Unmatched, bank only:
NSF 350, note 3,500, fee 500, service charge 5, interest 3. Unmatched, book
only: deposit 6,700 (in transit), checks 2004, 2008, 2009, 2012 (outstanding).
Amount mismatch: check 2005 — 5,483 in the books, 5,843 at the bank (book error).
Journal entries: Cash 3 / Interest revenue 3; Cash 3,000 + Collection fee 500 /
Notes receivable 3,500; Bank fees 5 / Cash 5; A/R 350 / Cash 350; Equipment 360 /
Cash 360.
`,
  );
}

// ---------------------------------------------------------- US, October ------
//
// The next period, invented here as a continuation of the Lumen exercise (no
// published October exists) and carried the way an accountant would: every
// September timing item clears in the first days of October; the bookkeeper
// posts September's five bank items on the 1st; the check 2005 correction is
// NOT posted, so the books are still 360 high and nothing in October's own
// files says so — only the prior reconciliation does (D-223's measurement:
// without it the sides end 360 apart, with it they meet). Same headers as
// September on purpose: that is the shape the roll-forward is keyed on.
{
  const usd = (n) => n.toFixed(2);
  const book = [
    ['2026-10-01', 'BAL', 'Opening balance', 0, 0],
    ['2026-10-01', 'JE-0901', 'Interest — September', 3, 0],
    ['2026-10-01', 'JE-0902', 'Note collected — Acme Co. (September)', 3500, 0],
    ['2026-10-01', 'JE-0903', 'Collection fee — Acme note (September)', 0, 500],
    ['2026-10-01', 'JE-0904', 'Service charge — September', 0, 5],
    ['2026-10-01', 'JE-0905', 'Returned check — NSF — J. Doe (September)', 0, 350],
    ['2026-10-02', '2013', 'Ridge Supply Co.', 0, 1450],
    ['2026-10-03', 'DEP', 'Deposit — daily receipts', 3100, 0],
    ['2026-10-08', '2014', 'Northside Utilities', 0, 780],
    ['2026-10-10', 'DEP', 'Deposit — daily receipts', 4750, 0],
    ['2026-10-14', '2015', 'Metro Leasing — October rent', 0, 2200],
    ['2026-10-17', 'DEP', 'Deposit — daily receipts', 2600, 0],
    ['2026-10-21', '2016', 'Lakeside Printing', 0, 1050],
    ['2026-10-24', 'DEP', 'Deposit — daily receipts', 5300, 0],
    ['2026-10-29', '2017', 'Crown Cleaning Services', 0, 925],
    ['2026-10-31', '2018', 'Payroll — period ending 10/31', 0, 4800],
    ['2026-10-31', 'DEP', 'Deposit — daily receipts (night drop)', 2950, 0],
  ];
  const bank = [
    ['2026-10-01', 'Opening balance', '', 0, 0],
    ['2026-10-01', 'Deposit', '', 0, 6700],
    ['2026-10-02', 'Check', '2012', 5500, 0],
    ['2026-10-02', 'Check', '2004', 1000, 0],
    ['2026-10-03', 'Deposit', '', 0, 3100],
    ['2026-10-03', 'Check', '2008', 650, 0],
    ['2026-10-06', 'Check', '2009', 200, 0],
    ['2026-10-06', 'Check', '2013', 1450, 0],
    ['2026-10-10', 'Deposit', '', 0, 4750],
    ['2026-10-12', 'Check', '2014', 780, 0],
    ['2026-10-17', 'Deposit', '', 0, 2600],
    ['2026-10-19', 'Check', '2015', 2200, 0],
    ['2026-10-24', 'Deposit', '', 0, 5300],
    ['2026-10-26', 'Check', '2016', 1050, 0],
    ['2026-10-31', 'Service charge', '', 5, 0],
    ['2026-10-31', 'Interest', '', 0, 4],
  ];
  // Each side opens where September closed it.
  let b = 24457;
  const bookRows = book.map(([d, ref, desc, dep, wd]) => {
    b += dep - wd;
    return [d, ref, desc, dep ? usd(dep) : '', wd ? usd(wd) : '', usd(b)].join(',');
  });
  let k = 27395;
  const bankRows = bank.map(([d, desc, chk, debit, credit]) => {
    k += credit - debit;
    return [d, desc, chk, debit ? usd(debit) : '', credit ? usd(credit) : '', usd(k)].join(',');
  });
  assertEq('US Oct book ending', b, 34600);
  assertEq('US Oct bank ending', k, 37014);
  // The invariant the fixture is built to: only October's own timing items
  // and bank lines adjust, plus the one September item still unbooked.
  assertEq('US Oct statement adjusted', k + 2950 - 925 - 4800, 34239);
  assertEq('US Oct records adjusted', b - 5 + 4 - 360, 34239);
  out(
    'us-oct/bank-statement-2026-10.csv',
    ['Date,Description,Check No,Debit,Credit,Balance', ...bankRows].join('\n') + '\n',
  );
  out(
    'us-oct/cash-ledger-2026-10.csv',
    ['Date,Ref,Description,Deposit,Withdrawal,Balance', ...bookRows].join('\n') + '\n',
  );
  out(
    'us-oct/SOLUTION.md',
    `# Expected reconciliation — My Company, October 31, 2026

A continuation of the September exercise invented here (no published October
exists), carried as an accountant would. Kept OUT of the job's attachments.
The point of the month: **the prior reconciliation is the only evidence for
the 360** — September's check 2005 correction was never posted, and nothing in
October's own files says so.

Bank statement balance 37,014.00 · Book balance 34,600.00

| Bank side | | Book side | |
|---|---|---|---|
| Ending bank balance | 37,014.00 | Ending book balance | 34,600.00 |
| + Deposit in transit 10/31 | 2,950.00 | + Interest | 4.00 |
| − Outstanding checks 2017, 2018 | (5,725.00) | − Service charge | (5.00) |
| | | − Check 2005 correction, **carried from September, still unposted** | (360.00) |
| **Adjusted** | **34,239.00** | **Adjusted** | **34,239.00** |

Matched within October: deposits 3,100 / 4,750 / 2,600 / 5,300 and checks
2013, 2014, 2015, 2016.

**Cleared from the prior period — findings, not adjustments.** Bank only, in
the first days of October, with no October book line because September's books
already carried them: the 6,700 night-drop deposit (10/1) and checks 2012
(10/2), 2004 (10/2), 2008 (10/3), 2009 (10/6). Every one was an open item in
the September reconciliation.

**Prior-period bank items now booked — settled, never adjusted twice.** Book
only, all dated 10/1 (JE-0901 … JE-0905): interest 3, note collected 3,500,
collection fee 500, service charge 5, NSF 350 — September's records-side
adjustments, posted. No October statement line, because the bank did them in
September.

**Aged.** Check 2005 recorded 5,483 and paid 5,843: the books are still 360
high, one period on. The only way to know is the prior reconciliation.

Unmatched, bank only, October's own: service charge 5, interest 4. Unmatched,
book only, October's own: checks 2017 (925) and 2018 (4,800) outstanding;
deposit 2,950 in transit. Journal entries: Cash 4 / Interest revenue 4;
Bank fees 5 / Cash 5; Equipment 360 / Cash 360 (overdue since September).

A run **without** the prior, done honestly, ends 360 apart — statement 34,239
against records 34,599 — and must say so rather than plug.
`,
  );
}

// ---------------------------------------------------------------- CL ---------
{
  const clp = (n) => String(Math.round(n)); // CLP has no cents
  const dmy = (iso) => iso.split('-').reverse().join('/');
  // Libro mayor, cuenta Banco — what the contador keeps (Debe = entra, Haber = sale).
  const libro = [
    ['2026-05-01', 'SI', 'Saldo inicial', 0, 0],
    ['2026-05-04', 'CI-1201', 'Transferencia recibida — Comercial Andes SpA, factura 4512', 1190000, 0],
    ['2026-05-06', 'CE-3307', 'Pago proveedor — Distribuidora Sur Ltda., factura 88721', 0, 892500],
    ['2026-05-11', 'CI-1202', 'Transferencia recibida — Servicios Maipo Ltda., factura 4513', 595000, 0],
    ['2026-05-13', 'CE-3308', 'Pago proveedor — Ferretería Central SpA, factura 10944', 0, 476000],
    ['2026-05-18', 'CI-1203', 'Transferencia recibida — Inversiones Lircay SA, factura 4514', 833000, 0],
    ['2026-05-20', 'CE-3309', 'Pago proveedor — Transportes Valle Ltda., factura 2201', 0, 238000],
    ['2026-05-26', 'CI-1204', 'Transferencia recibida — Comercial Andes SpA, factura 4515', 357000, 0],
    ['2026-05-29', 'CE-3310', 'Remuneraciones mayo', 0, 240650],
    ['2026-05-30', 'CE-3311', 'Transferencia a proveedor — Imprenta Norte Ltda., factura 5610', 0, 120000],
    ['2026-05-31', 'CI-1205', 'Depósito — Servicios Maipo Ltda., factura 4516', 242150, 0],
  ];
  // Cartola — what the bank shows (Cargo = sale, Abono = entra).
  const cartola = [
    ['2026-05-01', 'SALDO ANTERIOR', '', 0, 0],
    ['2026-05-04', 'TRANSFERENCIA DE COMERCIAL ANDES SPA', '4512', 0, 1190000],
    ['2026-05-06', 'TRANSFERENCIA A DISTRIBUIDORA SUR LTDA', '88721', 892500, 0],
    ['2026-05-11', 'TRANSFERENCIA DE SERVICIOS MAIPO LTDA', '4513', 0, 595000],
    ['2026-05-13', 'TRANSFERENCIA A FERRETERIA CENTRAL SPA', '10944', 476000, 0],
    ['2026-05-15', 'COMISION MANTENCION CUENTA', '', 15000, 0],
    ['2026-05-15', 'IVA COMISION', '', 2850, 0],
    ['2026-05-18', 'TRANSFERENCIA DE INVERSIONES LIRCAY SA', '4514', 0, 833000],
    ['2026-05-20', 'TRANSFERENCIA A TRANSPORTES VALLE LTDA', '2201', 238000, 0],
    ['2026-05-26', 'TRANSFERENCIA DE COMERCIAL ANDES SPA', '4515', 0, 357000],
    ['2026-05-29', 'PAGO NOMINA REMUNERACIONES', '', 240650, 0],
    ['2026-05-31', 'INTERESES GANADOS', '', 0, 8500],
  ];
  const OPEN = 3000000;
  let s = OPEN;
  const libroRows = libro.map(([d, comp, glosa, debe, haber]) => {
    s += debe - haber;
    return [dmy(d), comp, glosa, debe ? clp(debe) : '', haber ? clp(haber) : '', clp(s)].join(';');
  });
  let c = OPEN;
  const cartolaRows = cartola.map(([d, desc, doc, cargo, abono]) => {
    c += abono - cargo;
    return [dmy(d), desc, doc, cargo ? clp(cargo) : '', abono ? clp(abono) : '', clp(c)].join(';');
  });
  assertEq('CL libro ending', s, 4250000);
  assertEq('CL cartola ending', c, 4118500);
  out(
    'cl/cartola-mayo-2026.csv',
    ['Fecha;Descripción;N° Documento;Cargo;Abono;Saldo', ...cartolaRows].join('\n') + '\n',
  );
  out(
    'cl/libro-mayor-banco-mayo-2026.csv',
    ['Fecha;Comprobante;Glosa;Debe;Haber;Saldo', ...libroRows].join('\n') + '\n',
  );

  // The no-books variant: the SII registers for the same month, in the shape
  // of "Descargar Detalles" (semicolon CSV; header as commonly parsed by
  // Chilean tooling — to be checked against a real export before B3 fixes it
  // in a test). Totals equal the transfers above; the bank's own fee is a
  // purchase invoice too, paid in two cartola lines (15.000 + 2.850).
  const ventas = [
    [1, 33, 'Del Giro', '76.123.456-7', 'COMERCIAL ANDES SPA', 4512, '2026-05-02', 1000000, 190000, 1190000],
    [2, 33, 'Del Giro', '77.234.567-8', 'SERVICIOS MAIPO LTDA', 4513, '2026-05-09', 500000, 95000, 595000],
    [3, 33, 'Del Giro', '96.345.678-9', 'INVERSIONES LIRCAY SA', 4514, '2026-05-16', 700000, 133000, 833000],
    [4, 33, 'Del Giro', '76.123.456-7', 'COMERCIAL ANDES SPA', 4515, '2026-05-23', 300000, 57000, 357000],
    [5, 33, 'Del Giro', '77.234.567-8', 'SERVICIOS MAIPO LTDA', 4516, '2026-05-28', 203487, 38663, 242150],
    [6, 33, 'Del Giro', '96.345.678-9', 'INVERSIONES LIRCAY SA', 4517, '2026-05-30', 450000, 85500, 535500],
  ];
  const compras = [
    [1, 33, 'Del Giro', '78.456.789-0', 'DISTRIBUIDORA SUR LTDA', 88721, '2026-05-03', 750000, 142500, 892500],
    [2, 33, 'Del Giro', '76.567.890-1', 'FERRETERIA CENTRAL SPA', 10944, '2026-05-10', 400000, 76000, 476000],
    [3, 33, 'Del Giro', '97.000.000-0', 'BANCO DEL PUERTO', 990311, '2026-05-15', 15000, 2850, 17850],
    [4, 33, 'Del Giro', '77.678.901-2', 'TRANSPORTES VALLE LTDA', 2201, '2026-05-17', 200000, 38000, 238000],
    [5, 33, 'Del Giro', '76.789.012-3', 'IMPRENTA NORTE LTDA', 5610, '2026-05-27', 100840, 19160, 120000],
    [6, 33, 'Del Giro', '78.890.123-4', 'ASEO Y JARDINES LTDA', 7788, '2026-05-29', 150000, 28500, 178500],
  ];
  for (const r of [...ventas, ...compras]) assertEq(`RCV row ${r[5]} total`, r[7] + r[8], r[9]);
  const VENTAS_HEADER =
    'Nro;Tipo Doc;Tipo Venta;Rut cliente;Razon Social;Folio;Fecha Docto;Fecha Recepcion;Fecha Acuse Recibo;Fecha Reclamo;Monto Exento;Monto Neto;Monto IVA;Monto total';
  const COMPRAS_HEADER =
    'Nro;Tipo Doc;Tipo Compra;RUT Proveedor;Razon Social;Folio;Fecha Docto;Fecha Recepcion;Fecha Acuse;Monto Exento;Monto Neto;Monto IVA Recuperable;Monto Iva No Recuperable;Codigo IVA No Rec.;Monto Total';
  const vRows = ventas.map(([n, t, tv, rut, rs, folio, f, neto, iva, total]) =>
    [n, t, tv, rut, rs, folio, dmy(f), dmy(f), '', '', 0, neto, iva, total].join(';'),
  );
  const cRows = compras.map(([n, t, tc, rut, rs, folio, f, neto, iva, total]) =>
    [n, t, tc, rut, rs, folio, dmy(f), dmy(f), dmy(f), 0, neto, iva, 0, '', total].join(';'),
  );
  out('cl/sii-rcv-ventas-mayo-2026.csv', [VENTAS_HEADER, ...vRows].join('\n') + '\n');
  out('cl/sii-rcv-compras-mayo-2026.csv', [COMPRAS_HEADER, ...cRows].join('\n') + '\n');
  out(
    'cl/SOLUTION.md',
    `# Conciliación esperada — 31 de mayo de 2026

Fuente: Edig, "¿Qué es la conciliación bancaria en Chile? Guía paso a paso con
ejemplo" (edig.cl/conciliacion-bancaria). Las líneas que calzan en ambos lados
son inventadas para llegar a los saldos publicados; este archivo NO se adjunta.

Saldo cartola 4.118.500 · Saldo libro mayor banco 4.250.000

| Lado banco (cartola) | | Lado libro | |
|---|---|---|---|
| Saldo según cartola | 4.118.500 | Saldo según libro mayor | 4.250.000 |
| + Depósito en tránsito 31/05 (factura 4516) | 242.150 | + Intereses abonados no contabilizados | 8.500 |
| − Transferencia emitida no procesada (Imprenta Norte, factura 5610) | (120.000) | − Comisión mantención no contabilizada | (15.000) |
| | | − IVA comisión (19%) no contabilizado | (2.850) |
| **Saldo conciliado** | **4.240.650** | **Saldo conciliado** | **4.240.650** |

Calzan en ambos lados: abonos 1.190.000 / 595.000 / 833.000 / 357.000 y cargos
892.500 / 476.000 / 238.000 / 240.650. Solo cartola: comisión 15.000, IVA 2.850,
intereses 8.500. Solo libro: depósito 242.150 (en tránsito), transferencia
120.000 (emitida, no procesada). Asientos: Gastos bancarios 15.000 + IVA crédito
2.850 a Banco 17.850; Banco 8.500 a Ingresos financieros 8.500.

Variante sin libros (registros SII): la factura de venta 4517 (535.500) está
emitida y NO pagada al 31/05 — queda como cuenta por cobrar, no es diferencia
bancaria; la factura de compra 7788 (178.500) está recibida y NO pagada — cuenta
por pagar. La comisión del banco es una factura de compra (990311, 17.850) que
calza con DOS líneas de la cartola (15.000 + 2.850). Las transferencias de la
cartola calzan con las facturas por monto total y por el folio en la glosa.
`,
  );
}

out(
  'README.md',
  `# Reconciliation trial fixtures

Generic, attributed, no proprietary data. Generated by make-fixtures.mjs, which
asserts the published ending balances before writing anything.

- us/  — bank-statement-2026-09.csv + cash-ledger-2026-09.csv (self-kept books, USD, comma CSV)
- us-oct/ — the next period of the same books (invented continuation, same headers): the prior reconciliation is the only evidence for a 360 the books still carry (D-223)
- cl/  — cartola-mayo-2026.csv + libro-mayor-banco-mayo-2026.csv (contador's ledger, CLP, semicolon CSV)
         + sii-rcv-ventas-mayo-2026.csv + sii-rcv-compras-mayo-2026.csv (the no-books variant)
- SOLUTION.md in each folder is the answer key — never attached to a job.

Sources: Lumen Learning Financial Accounting (SUNY), "Preparing a Bank
Reconciliation", CC BY 4.0 (after Edwards & Hermanson); Edig,
"¿Qué es la conciliación bancaria en Chile? Guía paso a paso con ejemplo".
`,
);
