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
  it('grava sem o nome do contribuinte', () => {
    const s = fakeStorage();
    expect(saveEntry(caso({propertyDescription: 'Apto fictício'}), s)).toBe(true);
    const list = loadHistory(s);
    expect(list).toHaveLength(1);
    expect(list[0].input.taxpayerName).toBe('');
    expect(list[0].input.propertyDescription).toBe('Apto fictício');
    expect(s.getItem(HISTORY_KEY)).not.toContain('Fulano');
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
