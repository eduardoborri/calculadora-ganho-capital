import {describe, expect, it} from 'vitest';
import * as excelModule from 'exceljs';
import type {Worksheet} from 'exceljs';
import FormulaParser from 'fast-formula-parser';
import {calculateCase, defaultCaseInput} from '../src/utils/capitalGain';
import {buildWorkbook} from '../src/utils/xlsxReport';
import type {CaseInput, CostItem, Installment, ValueUpdate} from '../src/types';

// Fictitious cases only. The workbook is built with the real exceljs and every formula cell is
// recalculated with fast-formula-parser, which stands in for Excel.

// exceljs is CommonJS: the module object may come as the default export.
const ExcelJS = ((excelModule as unknown as {default?: typeof excelModule}).default ?? excelModule) as typeof excelModule;

type Sheet = Worksheet;

function caso(partial: Partial<CaseInput>): CaseInput {
  return {...defaultCaseInput(), taxpayerName: 'Pessoa Fictícia', ...partial};
}

function item(id: string, date: string, value: number, extra: Partial<CostItem> = {}): CostItem {
  return {id, description: id, date, value, hasDocument: true, ...extra};
}

function parcela(id: string, date: string, value: number, brokerage = 0): Installment {
  return {id, date, value, brokerage};
}

function update(partial: Partial<ValueUpdate>): ValueUpdate {
  return {
    law: '14973',
    date: '2024-12-10',
    caa: 500000,
    dta: 1000000,
    originalAcquisitionDate: '2010-03-15',
    migratedFrom14973: false,
    taxPaidSelic: 0,
    exceptionCausaMortisOuPartilha: false,
    ...partial,
  };
}

function reinv(partial: Partial<CaseInput['reinvestment']>): CaseInput['reinvestment'] {
  return {...defaultCaseInput().reinvestment, enabled: true, ...partial};
}

const base = {acquisitionDate: '2015-03-10', contractDate: '2025-10-10'};

const CASES: [string, CaseInput][] = [
  [
    'case 1: m1 = 0, m2 = 195',
    caso({
      acquisitionDate: '2009-08-10',
      contractDate: '2025-10-10',
      saleValue: 1000000,
      costItems: [item('compra', '2009-08-10', 300000)],
    }),
  ],
  [
    'case 7: reinvestment of 600,000 on 1,000,000',
    caso({
      ...base,
      saleValue: 1000000,
      costItems: [item('compra', '2015-03-10', 600000)],
      reinvestment: reinv({applications: [{id: 'a', date: '2026-03-01', value: 600000, kind: 'aquisicao'}]}),
    }),
  ],
  [
    'case 8: installment of 250,000',
    caso({
      ...base,
      saleMode: 'prazo',
      saleValue: 1000000,
      costItems: [item('compra', '2015-03-10', 600000)],
      installments: [parcela('a', '2025-10-15', 250000)],
    }),
  ],
  [
    'case 9: sale in parts within the window',
    caso({
      ...base,
      saleMode: 'partes',
      saleValue: 4000000,
      costItems: [item('compra', '2015-03-10', 1000000)],
      priorParts: [{id: 'a', date: '2024-06-10', gain: 4000000, taxPaid: 600000}],
    }),
  ],
  [
    'case 15: Lei 14.973 at 16%',
    caso({acquisitionDate: '2010-03-15', contractDate: '2029-02-10', saleValue: 2000000, update: update({})}),
  ],
  [
    'Lei 14.973 at 0% (only the CAA line in the engine)',
    caso({acquisitionDate: '2010-03-15', contractDate: '2026-06-10', saleValue: 2000000, update: update({})}),
  ],
  [
    'installment sale with brokerage in two months and reinvestment',
    caso({
      ...base,
      saleMode: 'prazo',
      saleValue: 1000000,
      costItems: [item('compra', '2015-03-10', 400000)],
      installments: [
        parcela('a', '2025-10-15', 300000, 30000),
        parcela('b', '2025-12-05', 600000, 10000),
        parcela('c', '2025-10-28', 100000),
      ],
      reinvestment: reinv({applications: [{id: 'a', date: '2026-01-20', value: 300000, kind: 'aquisicao'}]}),
    }),
  ],
  [
    'Rearp undone in an installment sale: the deduction carries back',
    caso({
      acquisitionDate: '1985-06-10',
      contractDate: '2027-03-10',
      saleMode: 'prazo',
      saleValue: 1500000,
      installments: [parcela('a', '2027-03-20', 1400000), parcela('b', '2027-05-20', 100000, 90000)],
      update: update({
        law: 'rearp',
        date: '2026-01-15',
        caa: 300000,
        dta: 700000,
        originalAcquisitionDate: '1985-06-10',
        taxPaidSelic: 10000,
      }),
    }),
  ],
  [
    'condominium with an indexed land item, a manual item and the land rule',
    caso({
      acquisitionDate: '1995-10-01',
      contractDate: '2025-10-10',
      ownership: 'condominio',
      quotaPct: 50,
      saleValue: 2000000,
      brokerage: 20000,
      landRule: true,
      costItems: [
        item('terreno', '1995-10-01', 0, {isLand: true, original: {amount: 10000, moeda: 'Reais'}}),
        item('projeto', '1995-11-05', 6000, {original: {amount: 5000, moeda: 'Reais'}, manual: true}),
        item('obra', '1998-05-10', 200000, {hasDocument: false}),
      ],
    }),
  ],
  [
    'single property exemption',
    caso({
      ...base,
      saleValue: 400000,
      costItems: [item('compra', '2015-03-10', 100000)],
      singleProperty: {onlyProperty: true, noSaleIn5Years: true},
    }),
  ],
  ['zero cost: one virtual line', caso({acquisitionDate: '2010-03-10', contractDate: '2011-03-20', saleValue: 100000})],
  [
    'gross gain below zero: no tax and no negative base',
    caso({...base, saleValue: 300000, costItems: [item('compra', '2015-03-10', 400000)]}),
  ],
  [
    'sale in parts with the prior part outside the window',
    caso({
      ...base,
      saleMode: 'partes',
      saleValue: 4000000,
      costItems: [item('compra', '2015-03-10', 1000000)],
      priorParts: [{id: 'a', date: '2023-06-10', gain: 4000000, taxPaid: 600000}],
    }),
  ],
  [
    'condominium in an installment sale',
    caso({
      ...base,
      saleMode: 'prazo',
      ownership: 'condominio',
      quotaPct: 50,
      saleValue: 1000000,
      costItems: [item('compra', '2015-03-10', 300000)],
      installments: [parcela('a', '2025-10-15', 200000, 5000), parcela('b', '2025-11-17', 300000)],
    }),
  ],
  [
    'sale in parts with the Rearp undone',
    caso({
      acquisitionDate: '1985-06-10',
      contractDate: '2027-03-10',
      saleMode: 'partes',
      saleValue: 1500000,
      priorParts: [{id: 'a', date: '2026-06-10', gain: 100000, taxPaid: 15000}],
      update: update({
        law: 'rearp',
        date: '2026-01-15',
        caa: 300000,
        dta: 700000,
        originalAcquisitionDate: '1985-06-10',
        taxPaidSelic: 10000,
      }),
    }),
  ],
];

// ---- recalculation ----

const REF = /\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?/g;
const IN_PROGRESS = Symbol('in progress');

function colNumber(letters: string): number {
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}

function formulaOf(value: unknown): string | null {
  return value !== null && typeof value === 'object' && 'formula' in value ? String((value as {formula: string}).formula) : null;
}

// fast-formula-parser 1.0.x has no MIN and MAX, and ROUND is only reached by the conference rows,
// so these three are registered with Excel semantics. A parameter may come wrapped as
// {value, isArray, isRangeRef, isCellRef, omitted}, as a plain value, or as a (nested) array from a
// range. Only numbers count: empty cells, text and booleans in ranges are ignored. An error value
// in any argument, direct or inside a range, propagates as in Excel.
function firstError(param: unknown): unknown {
  if (isError(param)) return param;
  if (Array.isArray(param)) {
    for (const entry of param) {
      const found = firstError(entry);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (param !== null && typeof param === 'object' && 'value' in param) return firstError((param as {value: unknown}).value);
  return undefined;
}

function numbersOf(param: unknown): number[] {
  if (Array.isArray(param)) return param.flatMap(numbersOf);
  if (param !== null && typeof param === 'object' && 'value' in param) return numbersOf((param as {value: unknown}).value);
  return typeof param === 'number' && Number.isFinite(param) ? [param] : [];
}

// MIN and MAX of no numbers are 0, as in Excel.
const extreme = (pick: (a: number, b: number) => number) => (...params: unknown[]): unknown => {
  const error = firstError(params);
  if (error !== undefined) return error;
  const values = params.flatMap(numbersOf);
  return values.length === 0 ? 0 : values.reduce((acc, v) => pick(acc, v));
};

// Half away from zero, after trimming binary noise to 15 significant digits.
function excelRound(number: unknown, digits?: unknown): unknown {
  const error = firstError([number, digits]);
  if (error !== undefined) return error;
  const x = numbersOf(number)[0] ?? 0;
  const d = digits === undefined ? 0 : (numbersOf(digits)[0] ?? 0);
  const factor = 10 ** Math.trunc(d);
  const magnitude = Math.round(Number((Math.abs(x) * factor).toPrecision(15))) / factor;
  return x < 0 ? -magnitude : magnitude;
}

const EXCEL_FUNCTIONS = {MIN: extreme(Math.min), MAX: extreme(Math.max), ROUND: excelRound};

function isError(value: unknown): boolean {
  const FormulaError = (FormulaParser as unknown as {FormulaError?: new () => unknown}).FormulaError;
  return value instanceof Error || (FormulaError !== undefined && value instanceof FormulaError);
}

// Recalculates the sheet. The parser is not re-entrant, so the cells a formula refers to are
// evaluated first and the callbacks only read the cache.
function recalculator(ws: Sheet): (address: string) => unknown {
  const cache = new Map<string, unknown>();
  const key = (row: number, col: number) => `${row},${col}`;
  const cached = (row: number, col: number): unknown => {
    const k = key(row, col);
    if (!cache.has(k)) throw new Error(`cell ${k} read before evaluation`);
    return cache.get(k);
  };
  const parser = new FormulaParser({
    functions: EXCEL_FUNCTIONS,
    onCell: ({row, col}: {row: number; col: number}) => cached(row, col),
    onRange: ({from, to}: {from: {row: number; col: number}; to: {row: number; col: number}}) => {
      const rows: unknown[][] = [];
      for (let r = from.row; r <= to.row; r++) {
        const line: unknown[] = [];
        for (let c = from.col; c <= to.col; c++) line.push(cached(r, c));
        rows.push(line);
      }
      return rows;
    },
  });

  const evaluate = (row: number, col: number): unknown => {
    const k = key(row, col);
    if (cache.has(k)) {
      const known = cache.get(k);
      if (known === IN_PROGRESS) throw new Error(`circular reference at ${k}`);
      return known;
    }
    const raw = ws.getCell(row, col).value;
    const formula = formulaOf(raw);
    if (formula === null) {
      cache.set(k, raw ?? null);
      return raw ?? null;
    }
    cache.set(k, IN_PROGRESS);
    for (const m of formula.matchAll(REF)) {
      const c1 = colNumber(m[1]);
      const r1 = Number(m[2]);
      const c2 = m[3] ? colNumber(m[3]) : c1;
      const r2 = m[4] ? Number(m[4]) : r1;
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) evaluate(r, c);
    }
    const value = parser.parse(formula, {sheet: ws.name, row, col});
    cache.set(k, value);
    return value;
  };

  return (address: string) => {
    const cell = ws.getCell(address);
    return evaluate(Number(cell.row), Number(cell.col));
  };
}

function formulaAddresses(ws: Sheet): string[] {
  const out: string[] = [];
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      if (formulaOf(cell.value) !== null) out.push(cell.address);
    });
  });
  return out;
}

// Address of the value (column C) of the single-value row labelled `ref` in column A.
function valueCellOf(ws: Sheet, ref: string): string {
  let found: string | null = null;
  ws.eachRow((row, rowNumber) => {
    if (row.getCell(1).value === ref) found = `C${rowNumber}`;
  });
  if (!found) throw new Error(`row ${ref} not found`);
  return found;
}

function build(input: CaseInput) {
  const result = calculateCase(input);
  expect(result.status, result.missing.join(' | ')).toBe('ok');
  const {workbook, conference} = buildWorkbook(ExcelJS, {input, result});
  const ws = workbook.getWorksheet('Apuração') as Sheet;
  return {result, workbook, conference, ws};
}

describe('spreadsheet conference', () => {
  for (const [name, input] of CASES) {
    it(`${name}: every difference is zero`, () => {
      const {workbook, conference, ws} = build(input);
      expect(workbook.calcProperties.fullCalcOnLoad).toBe(true);
      expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Apuração']);
      expect(conference.map((row) => row.label)).toEqual([
        'Ganho bruto',
        'Base tributável',
        'Imposto pela tabela',
        'Imposto a pagar',
        'Soma do cronograma',
      ]);

      const value = recalculator(ws);
      for (const address of formulaAddresses(ws)) {
        const out = value(address);
        expect(isError(out), `${address}: ${formulaOf(ws.getCell(address).value)} -> ${String(out)}`).toBe(false);
        expect(typeof out, `${address}: ${formulaOf(ws.getCell(address).value)}`).toBe('number');
      }
      for (const row of conference) {
        expect(formulaOf(ws.getCell(row.sheet).value), row.label).not.toBeNull();
        expect(formulaOf(ws.getCell(row.diff).value), row.label).not.toBeNull();
        const diff = value(row.diff) as number;
        expect(Math.abs(diff), `${row.label}: planilha ${String(value(row.sheet))}, ferramenta ${String(value(row.tool))}`).toBeLessThan(0.005);
      }
    });
  }
});

describe('spreadsheet values', () => {
  it('case 1 gives the base and the tax of the spec', () => {
    const {conference, ws} = build(CASES[0][1]);
    const value = recalculator(ws);
    const sheet = (label: string) => value(conference.find((row) => row.label === label).sheet) as number;
    expect(Math.round(sheet('Base tributável') * 100) / 100).toBe(354168.2);
    expect(Math.round(sheet('Imposto pela tabela') * 100) / 100).toBe(53125.23);
  });

  it('case 9 sums the parts: tax 1,100,000 on 7,000,000 less 600,000 paid', () => {
    const input = CASES[3][1];
    const {result, ws} = build(input);
    const value = recalculator(ws);
    expect(value(valueCellOf(ws, 'B3')) as number).toBeCloseTo(result.taxableBase + 4000000, 6);
    expect(value(valueCellOf(ws, 'B5')) as number).toBe(600000);
  });

  it('cells are formulas: changing the sale value moves the gross gain', () => {
    const {result, conference, ws} = build(CASES[0][1]);
    ws.getCell(valueCellOf(ws, 'V1')).value = 1001000;
    const value = recalculator(ws);
    const gross = conference.find((row) => row.label === 'Ganho bruto');
    expect(value(gross.sheet) as number).toBeCloseTo(result.grossGain + 1000, 6);
    expect(value(gross.diff) as number).toBeCloseTo(1000, 6);
  });

  it('inputs are blue, requirement cells yellow and formulas black', () => {
    const {ws} = build(CASES[1][1]);
    const v1 = ws.getCell(valueCellOf(ws, 'V1'));
    expect(v1.font.color?.argb).toBe('FF0000FF');
    const r3 = ws.getCell(valueCellOf(ws, 'R3'));
    expect((r3.fill as {fgColor?: {argb?: string}}).fgColor?.argb).toBe('FFFFFF00');
    const g1 = ws.getCell(valueCellOf(ws, 'G1'));
    expect(formulaOf(g1.value)).not.toBeNull();
    expect(g1.font.color?.argb).toBe('FF000000');
  });

  it('the Rearp reversal flag is informative: grey, no yellow, no list', () => {
    const {ws} = build(CASES[7][1]);
    const u4 = ws.getCell(valueCellOf(ws, 'U4'));
    expect(u4.value).toBe(1);
    expect(u4.font.color?.argb).toBe('FF7F7F7F');
    expect(u4.font.italic).toBe(true);
    expect((u4.fill as {fgColor?: {argb?: string}} | undefined)?.fgColor?.argb).not.toBe('FFFFFF00');
    expect(u4.dataValidation?.type).toBeUndefined();
  });

  it('editable flags carry the 1/0 note and the list', () => {
    const {ws} = build(CASES[1][1]);
    const r3 = ws.getCell(valueCellOf(ws, 'R3'));
    expect(r3.dataValidation?.type).toBe('list');
    expect(String(r3.note)).toContain('1 = Sim, 0 = Não');
  });

  it('custom MIN, MAX and ROUND follow Excel', () => {
    const err = new Error('#DIV/0!');
    expect(EXCEL_FUNCTIONS.MIN({value: [[3, null, 'x'], [1]]}, {value: 2})).toBe(1);
    expect(EXCEL_FUNCTIONS.MAX({value: [[null]]})).toBe(0);
    expect(EXCEL_FUNCTIONS.MAX({value: [[1, err]]})).toBe(err);
    expect(EXCEL_FUNCTIONS.ROUND({value: -2.345}, {value: 2})).toBe(-2.35);
    expect(EXCEL_FUNCTIONS.ROUND({value: err}, {value: 2})).toBe(err);
  });

  it('marks a manual value', () => {
    const {ws} = build(CASES[8][1]);
    let marked = false;
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === 'string' && cell.value.includes('Valor informado manualmente')) marked = true;
      });
    });
    expect(marked).toBe(true);
  });

  it('refuses a case that is not ok', () => {
    const input = caso({});
    const result = calculateCase(input);
    expect(result.status).not.toBe('ok');
    expect(() => buildWorkbook(ExcelJS, {input, result})).toThrow();
  });
});
