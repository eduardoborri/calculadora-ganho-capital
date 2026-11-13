import {describe, expect, it} from 'vitest';
import {
  buildMemoLines,
  EXCESS_DEDUCTION_NOTE,
  payableNote,
  receivedCostLine,
  reductionsLabel,
} from '../src/components/memoLines';
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

describe('permuta com torna no memorial', () => {
  // Perguntao IRPF 2026, question 632; the received value is fictitious.
  const permuta = caso({
    acquisitionDate: '1990-10-15',
    contractDate: '2025-05-05',
    costItems: [item('dado', '1990-10-15', 60000)],
    operation: 'permuta',
    permuta: {torna: 10000, receivedValue: 60000},
  });

  it('mostra a torna, o custo atribuído e a proporção com quatro casas', () => {
    const r = calculateCase(permuta);
    expect(r.status).toBe('ok');
    const [torna, custo] = buildMemoLines(permuta, r);
    expect(torna.label).toBe('Torna recebida');
    expect(torna.value).toContain('10.000,00');
    expect(custo.label).toBe('Custo atribuído à torna');
    expect(custo.value).toContain('8.571,43');
    expect(custo.detail.map((d) => d.value)).toContain('14,2857%');
    expect(custo.detail.some((d) => d.label === 'Custo total do imóvel dado' && d.value?.includes('60.000,00'))).toBe(true);
  });

  it('traz o custo do imóvel recebido; a venda não', () => {
    const r = calculateCase(permuta);
    expect(receivedCostLine(permuta, r)?.value).toContain('51.428,57');
    const venda = caso({...permuta, operation: 'venda', saleValue: 70000});
    const rv = calculateCase(venda);
    expect(receivedCostLine(venda, rv)).toBeNull();
    expect(buildMemoLines(venda, rv)[0].label).toBe('Valor de alienação líquido');
  });
});

describe('review labels', () => {
  const venda = caso({...partes, saleMode: 'vista' as const, saleValue: 1500000});

  it('lists only the reductions applied', () => {
    const r = calculateCase(venda);
    expect(reductionsLabel(r.items)).toBe('Reduções (FR2)');
    const old = caso({...venda, acquisitionDate: '1985-03-10', costItems: [item('compra', '1985-03-10', 900000)]});
    expect(reductionsLabel(calculateCase(old).items)).toBe('Reduções (art. 18, FR1 e FR2)');
  });

  it('shows the nature and the date used in the cost line', () => {
    const input = caso({
      ...venda,
      costItems: [{...item('saldo', '2018-06-10', 900000), nature: 'preco'}],
    });
    const r = calculateCase(input);
    const custo = buildMemoLines(input, r)[1];
    expect(custo.detail[0].label).toContain('Parcela do preço; reduções pela data 10/03/2015');
  });
});
