import {describe, expect, it} from 'vitest';
import {calculateCase, defaultCaseInput, factorFR1, factorFR2, progressiveTax} from '../src/utils/capitalGain';
import {applyValueUpdate, law14973Percent} from '../src/utils/valueUpdate';
import type {CaseInput, CaseResult, ValueUpdate} from '../src/types';

function caso(partial: Partial<CaseInput>): CaseInput {
  return {...defaultCaseInput(), ...partial};
}

function lei(partial: Partial<ValueUpdate> = {}): ValueUpdate {
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

function rearp(partial: Partial<ValueUpdate> = {}): ValueUpdate {
  return lei({
    law: 'rearp',
    date: '2026-01-15',
    caa: 300000,
    dta: 700000,
    originalAcquisitionDate: '1985-06-10',
    taxPaidSelic: 10000,
    ...partial,
  });
}

function ids(r: CaseResult): string[] {
  return r.alerts.map((alert) => alert.id);
}

function levelOf(r: CaseResult, id: string): string | undefined {
  return r.alerts.find((alert) => alert.id === id)?.level;
}

// 50 completed months after the update of lei().
const case15 = {acquisitionDate: '2010-03-15', contractDate: '2029-02-10', saleValue: 2000000};
const rearpBase = {acquisitionDate: '1985-06-10', saleValue: 1500000};
const lastLockDay = '2031-01-15';
const firstFreeDay = '2031-01-16';

describe('law14973Percent', () => {
  it('case 15: 50 months is 16%', () => {
    expect(law14973Percent(50)).toBe(0.16);
  });

  it('table limits', () => {
    expect(law14973Percent(0)).toBe(0);
    expect(law14973Percent(36)).toBe(0);
    expect(law14973Percent(37)).toBe(0.08);
    expect(law14973Percent(48)).toBe(0.08);
    expect(law14973Percent(49)).toBe(0.16);
    expect(law14973Percent(132)).toBe(0.62);
    expect(law14973Percent(180)).toBe(0.94);
    expect(law14973Percent(181)).toBe(1);
  });
});

describe('applyValueUpdate', () => {
  it('without an update it keeps the input cost', () => {
    const costItems = [{id: 'a', description: 'a', date: '2015-03-10', value: 1000, hasDocument: true}];
    const input = caso({costItems, contractDate: '2025-10-10'});
    expect(applyValueUpdate(input)).toEqual({costItems, deductFromTax: 0, alerts: []});
  });

  it('Lei 14.973: CAA at the original date, DTA x % at the update date', () => {
    const out = applyValueUpdate(caso({...case15, update: lei()}));
    expect(out.costItems.map((line) => [line.date, line.value])).toEqual([
      ['2010-03-15', 500000],
      ['2024-12-10', 160000],
    ]);
    expect(out.deductFromTax).toBe(0);
  });

  it('months are completed months up to the contract', () => {
    const lines = (contractDate: string) =>
      applyValueUpdate(caso({...case15, contractDate, update: lei()})).costItems;
    expect(lines('2027-12-10')).toHaveLength(1);
    expect(lines('2028-01-09')).toHaveLength(1);
    expect(lines('2028-01-10')[1].value).toBeCloseTo(80000, 6);
  });
});

describe('Lei 14.973 through calculateCase', () => {
  it('case 15: GK 1,340,000, split between CAA and DTA by date', () => {
    const r = calculateCase(caso({...case15, update: lei()}));
    expect(r.status).toBe('ok');
    expect(r.totalCost).toBeCloseTo(660000, 6);
    expect(r.grossGain).toBeCloseTo(1340000, 6);
    expect(r.items).toHaveLength(2);
    expect(r.items[0].share).toBeCloseTo(500 / 660, 12);
    expect(r.items[1].share).toBeCloseTo(160 / 660, 12);
    expect(r.items.map((line) => line.m2)).toEqual([228, 51]);
    const expected =
      1340000 * (500 / 660) * factorFR2(228) + 1340000 * (160 / 660) * factorFR2(51);
    expect(r.gainAfterReductions).toBeCloseTo(expected, 6);
    expect(r.taxDue).toBeCloseTo(progressiveTax(expected).total, 6);
  });

  it('percent above zero is an open point', () => {
    const r = calculateCase(caso({...case15, update: lei()}));
    expect(levelOf(r, 'lei14973-rateio')).toBe('aberto');
    expect(levelOf(r, 'lei14973-percentual')).toBe('info');
  });

  it('at 0% there is only the CAA line and no open point on the split', () => {
    const r = calculateCase(caso({...case15, contractDate: '2027-12-10', update: lei()}));
    expect(r.totalCost).toBe(500000);
    expect(r.grossGain).toBe(1500000);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].share).toBe(1);
    expect(ids(r)).not.toContain('lei14973-rateio');
  });

  it('the quota scales the sale but not CAA and DTA, which are the holder own values', () => {
    const r = calculateCase(caso({...case15, ownership: 'condominio', quotaPct: 50, update: lei()}));
    expect(r.saleNet).toBe(1000000);
    expect(r.totalCost).toBeCloseTo(660000, 6);
    expect(r.grossGain).toBeCloseTo(340000, 6);
  });

  it('a CAA of zero is accepted, and at 0% the gain stays at the original date', () => {
    const r = calculateCase(caso({...case15, contractDate: '2027-12-10', update: lei({caa: 0})}));
    expect(r.status).toBe('ok');
    expect(r.totalCost).toBe(0);
    expect(r.grossGain).toBe(2000000);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].share).toBe(1);
    expect(r.items[0].m2).toBe(214);
  });

  it('a CAA of zero above 0% leaves the whole gain on the DTA line', () => {
    const r = calculateCase(caso({...case15, update: lei({caa: 0})}));
    expect(r.totalCost).toBeCloseTo(160000, 6);
    expect(r.items[1].share).toBe(1);
    expect(r.items[0].reducedGain).toBe(0);
  });

  it('art. 18 stays on the CAA share only, through the dates', () => {
    const update = lei({originalAcquisitionDate: '1985-06-10'});
    const r = calculateCase(caso({...case15, acquisitionDate: '1985-06-10', update}));
    expect(r.items[0].art18Pct).toBe(0.2);
    expect(r.items[0].m1).toBe(119);
    expect(r.items[1].art18Pct).toBe(0);
    expect(r.items[1].m1).toBe(0);
    expect(r.items[0].reducedGain).toBeCloseTo(
      r.items[0].gain * 0.8 * factorFR1(119) * factorFR2(r.items[0].m2),
      6,
    );
  });

  it('cost items and the land rule on the input are ignored, even when invalid, and say so', () => {
    const costItems = [{id: 'x', description: 'x', date: '2030-02-30', value: -1, hasDocument: false}];
    const clean = calculateCase(caso({...case15, update: lei()}));
    const r = calculateCase(caso({...case15, costItems, landRule: true, update: lei()}));
    expect(r.status).toBe('ok');
    expect(r.items).toEqual(clean.items);
    expect(r.taxDue).toBe(clean.taxDue);
    expect(levelOf(r, 'atualizacao-itens-ignorados')).toBe('info');
    expect(levelOf(r, 'atualizacao-regra-terreno')).toBe('aviso');
    expect(ids(r)).not.toContain('documento-faltante');
  });

  it('a different acquisition date is flagged', () => {
    const r = calculateCase(caso({...case15, acquisitionDate: '2012-01-01', update: lei()}));
    expect(levelOf(r, 'atualizacao-data-divergente')).toBe('aviso');
    expect(ids(calculateCase(caso({...case15, update: lei()})))).not.toContain('atualizacao-data-divergente');
  });
});

describe('Rearp after the lock', () => {
  it('the acquisition date is the option date and art. 18 is zero', () => {
    const r = calculateCase(caso({...rearpBase, contractDate: firstFreeDay, update: rearp()}));
    expect(r.status).toBe('ok');
    expect(r.totalCost).toBe(1000000);
    expect(r.grossGain).toBe(500000);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].art18Pct).toBe(0);
    expect(r.items[0].m1).toBe(0);
    expect(r.items[0].m2).toBe(61);
    expect(r.priorTaxPaid).toBe(0);
    expect(r.taxPayable).toBe(r.taxDue);
    expect(ids(r)).toContain('rearp-data');
    expect(ids(r)).not.toContain('rearp-reversao');
  });

  it('no tax paid is needed outside a reversal', () => {
    const update = rearp({taxPaidSelic: 0});
    expect(calculateCase(caso({...rearpBase, contractDate: firstFreeDay, update})).status).toBe('ok');
  });

  it('an option date after the deadline gets a warning', () => {
    const update = rearp({date: '2026-02-20'});
    const r = calculateCase(caso({...rearpBase, contractDate: '2031-02-21', update}));
    expect(levelOf(r, 'rearp-apos-prazo')).toBe('aviso');
    const onTime = rearp({date: '2026-02-19'});
    expect(ids(calculateCase(caso({...rearpBase, contractDate: '2031-02-21', update: onTime})))).not.toContain(
      'rearp-apos-prazo',
    );
  });
});

describe('Rearp within the lock', () => {
  const within = {...rearpBase, contractDate: lastLockDay};

  it('restores original cost and date, and deducts the tax paid', () => {
    const out = applyValueUpdate(caso({...within, update: rearp()}));
    expect(out.deductFromTax).toBe(10000);
    expect(out.costItems.map((line) => [line.date, line.value])).toEqual([['1985-06-10', 300000]]);

    const r = calculateCase(caso({...within, update: rearp()}));
    expect(r.status).toBe('ok');
    expect(r.totalCost).toBe(300000);
    expect(r.grossGain).toBe(1200000);
    expect(r.items[0].art18Pct).toBe(0.2);
    expect(r.items[0].m1).toBe(119);
    expect(r.taxDue).toBeGreaterThan(10000);
    expect(r.priorTaxPaid).toBe(10000);
    expect(r.taxPayable).toBeCloseTo(r.taxDue - 10000, 6);
    expect(r.schedule[0].tax).toBe(r.taxPayable);
    expect(levelOf(r, 'rearp-reversao')).toBe('risco');
  });

  it('the tax payable never goes below zero', () => {
    const r = calculateCase(caso({...within, update: rearp({taxPaidSelic: 999999})}));
    expect(r.priorTaxPaid).toBe(999999);
    expect(r.taxPayable).toBe(0);
    expect(r.schedule).toEqual([]);
  });

  it('the quota scales neither the CAA nor the tax paid', () => {
    const r = calculateCase(caso({...within, ownership: 'condominio', quotaPct: 50, update: rearp()}));
    expect(r.saleNet).toBe(750000);
    expect(r.totalCost).toBe(300000);
    expect(r.priorTaxPaid).toBe(10000);
  });

  it('missing tax paid is incomplete', () => {
    const r = calculateCase(caso({...within, update: rearp({taxPaidSelic: 0})}));
    expect(r.status).toBe('incompleto');
    expect(r.missing).toEqual(['Imposto pago corrigido pela Selic']);
  });

  it('in an installment sale the deduction spreads over the lines', () => {
    const installments = [
      {id: 'a', date: lastLockDay, value: 750000, brokerage: 0},
      {id: 'b', date: '2031-03-14', value: 750000, brokerage: 0},
    ];
    const r = calculateCase(caso({...within, saleMode: 'prazo', installments, update: rearp()}));
    expect(r.status).toBe('ok');
    expect(r.priorTaxPaid).toBe(10000);
    expect(r.taxPayable).toBeCloseTo(r.taxDue - 10000, 6);
    expect(r.schedule[0].tax).toBeCloseTo((r.taxDue - 10000) / 2, 6);
  });

  it('installment brokerage does not shrink the deduction', () => {
    const installments = [
      {id: 'a', date: lastLockDay, value: 750000, brokerage: 15000},
      {id: 'b', date: '2031-03-14', value: 750000, brokerage: 15000},
    ];
    const r = calculateCase(caso({...within, saleMode: 'prazo', installments, update: rearp()}));
    expect(r.taxPayable).toBeCloseTo(r.taxDue * 0.98 - 10000, 6);
  });

  it('a deduction above the tax leaves the installment lines at zero', () => {
    const installments = [{id: 'a', date: lastLockDay, value: 1500000, brokerage: 15000}];
    const update = rearp({taxPaidSelic: 999999});
    const r = calculateCase(caso({...within, saleMode: 'prazo', installments, update}));
    expect(r.schedule[0].tax).toBe(0);
    expect(r.taxPayable).toBe(0);
  });

  it('with prior parts it adds to the tax they paid', () => {
    const priorParts = [{id: 'a', date: '2030-03-10', gain: 100000, taxPaid: 15000}];
    const r = calculateCase(caso({...within, saleMode: 'partes', priorParts, update: rearp()}));
    expect(r.priorTaxPaid).toBe(25000);
    expect(r.taxPayable).toBeCloseTo(r.taxDue - 25000, 6);
    expect(ids(r)).not.toContain('partes-diferenca-anterior');
  });

  it('it stays with prior parts out of the window', () => {
    const priorParts = [{id: 'a', date: '2028-03-10', gain: 100000, taxPaid: 15000}];
    const r = calculateCase(caso({...within, saleMode: 'partes', priorParts, update: rearp()}));
    expect(r.priorTaxPaid).toBe(10000);
    expect(r.taxDue).toBeCloseTo(progressiveTax(r.taxableBase).total, 6);
  });

  it('the deduction does not hide a shortfall of the prior parts', () => {
    const priorParts = [{id: 'a', date: '2030-03-10', gain: 100000, taxPaid: 10000}];
    const update = rearp({taxPaidSelic: 50000});
    const r = calculateCase(caso({...within, saleMode: 'partes', priorParts, update}));
    expect(r.priorTaxPaid).toBe(60000);
    expect(ids(r)).toContain('partes-diferenca-anterior');
  });

  it('exception of causa mortis or partition: nothing is undone', () => {
    const update = rearp({exceptionCausaMortisOuPartilha: true});
    const out = applyValueUpdate(caso({...within, update}));
    expect(out.deductFromTax).toBe(0);

    const r = calculateCase(caso({...within, update}));
    expect(r.totalCost).toBe(1000000);
    expect(r.items[0].art18Pct).toBe(0);
    expect(r.priorTaxPaid).toBe(0);
    expect(ids(r)).toContain('rearp-excecao');
    expect(ids(r)).not.toContain('rearp-reversao');
  });

  it('the 5th anniversary is still inside the lock, and the next day is not', () => {
    const run = (contractDate: string) => calculateCase(caso({...rearpBase, contractDate, update: rearp()}));
    expect(ids(run(lastLockDay))).toContain('rearp-reversao');
    expect(ids(run(firstFreeDay))).not.toContain('rearp-reversao');
  });
});

describe('migration from Lei 14.973', () => {
  const update = rearp({migratedFrom14973: true});

  it('date and cost go to the Deap', () => {
    const r = calculateCase(caso({...rearpBase, contractDate: firstFreeDay, update}));
    expect(r.totalCost).toBe(1000000);
    expect(r.items[0].art18Pct).toBe(0);
    expect(r.items[0].m2).toBe(61);
    expect(levelOf(r, 'rearp-migracao')).toBe('info');
    expect(ids(r)).not.toContain('rearp-data');
    expect(ids(r)).not.toContain('rearp-migracao-prazo');
  });

  it('it follows the Rearp within the lock, and asks for confirmation', () => {
    const r = calculateCase(caso({...rearpBase, contractDate: lastLockDay, update}));
    expect(r.totalCost).toBe(300000);
    expect(r.priorTaxPaid).toBe(10000);
    const alert = r.alerts.find((entry) => entry.id === 'rearp-reversao');
    expect(alert?.text).toContain('confirmado');
    expect(alert?.legal).toContain('art. 17');
    expect(levelOf(r, 'rearp-migracao-prazo')).toBe('aberto');
  });

  it('the flag means nothing with law 14973', () => {
    const plain = calculateCase(caso({...case15, update: lei()}));
    const flagged = calculateCase(caso({...case15, update: lei({migratedFrom14973: true})}));
    expect(flagged.totalCost).toBe(plain.totalCost);
    expect(flagged.items).toEqual(plain.items);
  });
});

describe('validation of the update', () => {
  const run = (partial: Partial<ValueUpdate>) => calculateCase(caso({...case15, update: lei(partial)}));

  it('missing fields make the case incomplete', () => {
    const cases: [Partial<ValueUpdate>, string][] = [
      [{date: ''}, 'Data da atualização'],
      [{originalAcquisitionDate: ''}, 'Data de aquisição original'],
      [{dta: 0}, 'DTA'],
      [{caa: 0, dta: 0}, 'DTA'],
    ];
    for (const [partial, label] of cases) {
      const r = run(partial);
      expect(r.status).toBe('incompleto');
      expect(r.missing).toEqual([label]);
    }
  });

  it('an update after the contract is invalid, and on the contract date is accepted', () => {
    expect(run({date: '2029-02-11'}).status).toBe('invalido');
    expect(run({date: '2029-02-10'}).status).toBe('ok');
  });

  it('an update before the original acquisition is invalid, and on it is accepted', () => {
    expect(run({date: '2010-03-14'}).status).toBe('invalido');
    expect(run({date: '2010-03-15'}).status).toBe('ok');
  });

  it('malformed dates are invalid', () => {
    expect(run({date: '2024-02-30'}).status).toBe('invalido');
    expect(run({originalAcquisitionDate: '2010-02-30'}).status).toBe('invalido');
  });

  it('bad amounts are invalid', () => {
    for (const value of [-1, NaN, Infinity, 1e16]) {
      expect(run({caa: value}).status).toBe('invalido');
      expect(run({dta: value}).status).toBe('invalido');
      expect(run({taxPaidSelic: value}).status).toBe('invalido');
    }
  });
});
