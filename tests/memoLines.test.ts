import {describe, expect, it} from 'vitest';
import {EXCESS_DEDUCTION_NOTE, payableNote} from '../src/components/memoLines';
import {calculateCase, defaultCaseInput} from '../src/utils/capitalGain';
import type {CaseInput, CostItem, PriorPart} from '../src/types';

// Fictitious cases only.

function caso(partial: Partial<CaseInput>): CaseInput {
  return {...defaultCaseInput(), ...partial};
}

function item(id: string, date: string, value: number): CostItem {
  return {id, description: id, date, value, hasDocument: true};
}

function parte(date: string, gain: number, taxPaid: number): PriorPart {
  return {id: 'p', date, gain, taxPaid};
}

const partes = {
  acquisitionDate: '2015-03-10',
  contractDate: '2025-10-10',
  saleValue: 1000000,
  saleMode: 'partes' as const,
  costItems: [item('compra', '2015-03-10', 900000)],
};

describe('payableNote', () => {
  it('a deduction above the tax of the table says the excess is not refunded', () => {
    const input = caso({...partes, priorParts: [parte('2025-02-10', 0, 100000)]});
    const r = calculateCase(input);
    expect(r.status).toBe('ok');
    expect(r.priorTaxPaid).toBeGreaterThan(r.taxDue);
    expect(r.taxPayable).toBe(0);
    expect(payableNote(input, r)).toBe(`Imposto da tabela sobre o total somado, menos o imposto já pago. ${EXCESS_DEDUCTION_NOTE}`);
    expect(EXCESS_DEDUCTION_NOTE).toContain('não fica abaixo de zero');
    expect(EXCESS_DEDUCTION_NOTE).toContain('não é restituído');
  });

  it('a deduction up to the tax of the table keeps the plain note', () => {
    const input = caso({...partes, priorParts: [parte('2025-02-10', 0, 1)]});
    const r = calculateCase(input);
    expect(r.status).toBe('ok');
    expect(r.priorTaxPaid).toBeLessThan(r.taxDue);
    expect(payableNote(input, r)).toBe('Imposto da tabela sobre o total somado, menos o imposto já pago.');
  });

  it('no deduction gives no note in a cash sale', () => {
    const input = caso({...partes, saleMode: 'vista'});
    const r = calculateCase(input);
    expect(r.status).toBe('ok');
    expect(payableNote(input, r)).toBeNull();
  });
});
