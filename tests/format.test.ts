import {describe, expect, it} from 'vitest';
import {formatFactor, round2, slug} from '../src/utils/format';

describe('round2', () => {
  it('rounds without floating-point error', () => {
    expect(round2(1.005)).toBe(1.01);
  });
  it('rounds negatives away from zero', () => {
    expect(round2(-1.005)).toBe(-1.01);
  });
  it('rounds 2.675 up', () => {
    expect(round2(2.675)).toBe(2.68);
  });
  it('never returns -0', () => {
    expect(Object.is(round2(0), 0)).toBe(true);
    expect(Object.is(round2(-0.001), 0)).toBe(true);
  });
  it('rounds to cents', () => {
    expect(round2(53125.229411)).toBe(53125.23);
  });
});

describe('formatFactor', () => {
  it('uses 6 decimals with pt-BR separator', () => {
    expect(formatFactor(0.5059546)).toBe('0,505955');
  });
});

describe('slug', () => {
  it('removes accents and joins with underscores', () => {
    expect(slug('João da Silva')).toBe('joao_da_silva');
  });
});
