import {describe, expect, it} from 'vitest';
import {calculateCase, defaultCaseInput} from '../src/utils/capitalGain';
import {HISTORY_KEY, clearHistory, loadHistory, removeEntry, saveEntry} from '../src/utils/history';
import type {CaseInput} from '../src/types';

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? (data.get(k) as string) : null),
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    removeItem: (k: string) => {
      data.delete(k);
    },
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
}

function throwingStorage(): Storage {
  const boom = (): never => {
    throw new Error('blocked');
  };
  return {
    get length(): number {
      return boom();
    },
    clear: boom,
    getItem: boom,
    key: boom,
    removeItem: boom,
    setItem: boom,
  };
}

function caso(partial: Partial<CaseInput> = {}): CaseInput {
  return {...defaultCaseInput(), taxpayerName: 'Fulano de Tal', ...partial};
}

describe('histórico', () => {
  it('grava sem o nome do contribuinte e sem a descrição do imóvel', () => {
    const s = fakeStorage();
    expect(saveEntry(caso({propertyDescription: 'Apto fictício', saleValue: 123456}), s)).toBe(true);
    const list = loadHistory(s);
    expect(list).toHaveLength(1);
    expect(list[0].input.taxpayerName).toBe('');
    expect(list[0].input.propertyDescription).toBe('');
    expect(list[0].input.saleValue).toBe(123456);
    expect(s.getItem(HISTORY_KEY)).not.toContain('Fulano');
    expect(s.getItem(HISTORY_KEY)).not.toContain('Apto fictício');
    expect(Number.isNaN(Date.parse(list[0].savedAt))).toBe(false);
  });

  it('ordena do mais novo para o mais antigo e limita a 50', () => {
    const s = fakeStorage();
    for (let i = 0; i < 52; i++) saveEntry(caso({saleValue: i}), s);
    const list = loadHistory(s);
    expect(list).toHaveLength(50);
    expect(list[0].input.saleValue).toBe(51);
    expect(list[49].input.saleValue).toBe(2);
  });

  it('removeEntry remove só o item pedido', () => {
    const s = fakeStorage();
    saveEntry(caso({saleValue: 1}), s);
    saveEntry(caso({saleValue: 2}), s);
    const [a, b] = loadHistory(s);
    removeEntry(a.id, s);
    const rest = loadHistory(s);
    expect(rest).toHaveLength(1);
    expect(rest[0].id).toBe(b.id);
  });

  it('clearHistory apaga tudo', () => {
    const s = fakeStorage();
    saveEntry(caso(), s);
    clearHistory(s);
    expect(loadHistory(s)).toEqual([]);
  });

  it('JSON corrompido ou fora do formato retorna lista vazia', () => {
    expect(loadHistory(fakeStorage({[HISTORY_KEY]: '{not json'}))).toEqual([]);
    expect(loadHistory(fakeStorage({[HISTORY_KEY]: '{"a":1}'}))).toEqual([]);
  });

  it('descarta entradas sem input objeto', () => {
    const raw = JSON.stringify([null, 5, {id: 'x'}, {id: 'y', input: []}, {id: 'z', input: {saleValue: 10}}]);
    const list = loadHistory(fakeStorage({[HISTORY_KEY]: raw}));
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('z');
  });

  it('normaliza entrada parcial e listas que não são arrays', () => {
    const raw = JSON.stringify([
      {
        id: 'old',
        savedAt: '2026-01-01T00:00:00.000Z',
        input: {
          saleValue: 500000,
          costItems: 'oops',
          installments: null,
          priorParts: {},
          reinvestment: {enabled: true, applications: 7},
        },
      },
    ]);
    const [entry] = loadHistory(fakeStorage({[HISTORY_KEY]: raw}));
    expect(entry.input.costItems).toEqual([]);
    expect(entry.input.installments).toEqual([]);
    expect(entry.input.priorParts).toEqual([]);
    expect(entry.input.reinvestment.applications).toEqual([]);
    expect(entry.input.reinvestment.enabled).toBe(true);
    expect(entry.input.reinvestment.firstContractDate).toBe('');
    expect(entry.input.saleMode).toBe('vista');
    expect(() => calculateCase(entry.input)).not.toThrow();
  });

  it.each([
    ['update vazio', {update: {}}],
    ['update com law inválida', {update: {law: 'x', date: '2026-01-01'}}],
    ['update parcial', {update: {law: 'rearp', date: '2026-01-01'}}],
    ['costItems null', {costItems: [null]}],
    ['costItems número', {costItems: [5]}],
    ['costItems vazio', {costItems: [{}]}],
    ['acquisitionDate null', {acquisitionDate: null}],
    ['contractDate número', {contractDate: 5}],
    ['saleValue texto', {saleValue: 'x'}],
    ['applications null', {reinvestment: {applications: [null]}}],
    ['applications vazio', {reinvestment: {applications: [{}]}}],
    ['installments vazio', {saleMode: 'prazo', installments: [{}]}],
    ['priorParts null', {saleMode: 'partes', priorParts: [null]}],
    ['priorParts vazio', {saleMode: 'partes', priorParts: [{}]}],
    ['outOfScope inválido', {outOfScope: ['xyz']}],
    ['enum inválido', {acquisitionForm: 'zzz', ownership: 1, saleMode: null}],
  ])('entrada corrompida (%s) não faz calculateCase lançar', (_nome, input) => {
    const raw = JSON.stringify([{id: 'a', savedAt: '2026-01-01T00:00:00.000Z', input}]);
    const [entry] = loadHistory(fakeStorage({[HISTORY_KEY]: raw}));
    expect(() => calculateCase(entry.input)).not.toThrow();
  });

  it('entrada bem formada faz ida e volta sem mudar', () => {
    const s = fakeStorage();
    const full = caso({
      taxpayerName: '',
      calendarYear: 2026,
      acquisitionDate: '2010-05-10',
      contractDate: '2026-03-01',
      saleValue: 800000,
      ownership: 'condominio',
      quotaPct: 50,
      saleMode: 'prazo',
      costItems: [
        {id: 'c1', description: 'Compra', date: '2010-05-10', value: 300000, hasDocument: true, isLand: true},
        {
          id: 'c2',
          description: 'Antigo',
          date: '1990-01-01',
          value: 10,
          hasDocument: false,
          original: {amount: 5, moeda: 'Cruzeiros'},
          manual: true,
        },
      ],
      installments: [{id: 'i1', date: '2026-04-01', value: 100000, brokerage: 10}],
      priorParts: [{id: 'p1', date: '2025-01-01', gain: 1000, taxPaid: 150}],
      smallValue: {sameNatureMonthTotal: 10, confirmed: true},
      singleProperty: {onlyProperty: true, noSaleIn5Years: true},
      reinvestment: {
        enabled: true,
        firstContractDate: '2026-03-01',
        usedInLast5Years: false,
        moreThanOneSale: false,
        landOrGarage: false,
        applications: [{id: 'a1', date: '2026-05-01', value: 5000, kind: 'quitacao'}],
      },
      update: {
        law: 'rearp',
        date: '2026-01-01',
        caa: 1,
        dta: 2,
        originalAcquisitionDate: '2000-01-01',
        migratedFrom14973: true,
        taxPaidSelic: 3,
        exceptionCausaMortisOuPartilha: false,
      },
      outOfScope: ['exterior'],
    });
    saveEntry(full, s);
    expect(loadHistory(s)[0].input).toEqual(full);
  });

  it('entrada sem id é descartada', () => {
    const raw = JSON.stringify([{input: {saleValue: 1}}, {id: 'ok', input: {}}]);
    const list = loadHistory(fakeStorage({[HISTORY_KEY]: raw}));
    expect(list.map((e) => e.id)).toEqual(['ok']);
  });

  it('setItem que lança faz saveEntry retornar false', () => {
    const s = fakeStorage();
    s.setItem = () => {
      throw new Error('quota');
    };
    expect(saveEntry(caso(), s)).toBe(false);
  });

  it('acesso que lança não propaga exceção', () => {
    const s = throwingStorage();
    expect(loadHistory(s)).toEqual([]);
    expect(saveEntry(caso(), s)).toBe(false);
    expect(() => removeEntry('x', s)).not.toThrow();
    expect(() => clearHistory(s)).not.toThrow();
  });
});
