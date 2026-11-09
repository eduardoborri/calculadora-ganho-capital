import {describe, expect, it} from 'vitest';
import {costIndex, currenciesFor} from '../src/data/custoAte1995';

describe('costIndex', () => {
  it('reads official values', () => {
    expect(costIndex('Reais', 1995, 12)).toBe(0.9596);
    expect(costIndex('Cruzados', 1988, 1)).toBe(53.3508);
    expect(costIndex('Cruzeiros', 1990, 3)).toBe(33.2962);
    expect(costIndex('Cruzados Novos', 1990, 3)).toBe(33.2962);
    expect(costIndex('Mil-Réis', 1938, 1)).toBe(4.6475);
  });
  it('returns null for empty cells', () => {
    expect(costIndex('Reais', 1993, 1)).toBeNull();
  });
});

describe('currenciesFor', () => {
  it('lists overlapping currencies', () => {
    const list = currenciesFor(1989, 1);
    expect(list).toContain('Cruzados');
    expect(list).toContain('Cruzados Novos');
  });
});
