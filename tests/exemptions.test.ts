import {describe, expect, it} from 'vitest';
import {calculateCase, defaultCaseInput, progressiveTax} from '../src/utils/capitalGain';
import {
  checkSingleProperty,
  checkSmallValue,
  isApplicationCounted,
  reinvestmentDeadline,
  reinvestmentOutcome,
} from '../src/utils/exemptions';
import type {Application, CaseInput} from '../src/types';

function caso(partial: Partial<CaseInput>): CaseInput {
  return {...defaultCaseInput(), ...partial};
}

function app(id: string, date: string, value: number, kind: Application['kind'] = 'aquisicao'): Application {
  return {id, date, value, kind};
}

function reinv(partial: Partial<CaseInput['reinvestment']>): CaseInput['reinvestment'] {
  return {...defaultCaseInput().reinvestment, enabled: true, ...partial};
}

const base = {acquisitionDate: '2015-03-10', contractDate: '2025-10-10'};
const single = {onlyProperty: true, noSaleIn5Years: true};

describe('single property exemption', () => {
  it('case 11: 440,000.00 is exempt', () => {
    const check = checkSingleProperty(caso({saleValue: 440000, singleProperty: single}));
    expect(check).toEqual({applies: true, reasons: []});
  });

  it('case 12: 440,000.01 is not exempt and says why', () => {
    const check = checkSingleProperty(caso({saleValue: 440000.01, singleProperty: single}));
    expect(check.applies).toBe(false);
    expect(check.reasons).toHaveLength(1);
    expect(check.reasons[0]).toContain('supera o limite');
  });

  it('without noSaleIn5Years it is not exempt and explains', () => {
    const check = checkSingleProperty(
      caso({saleValue: 300000, singleProperty: {onlyProperty: true, noSaleIn5Years: false}}),
    );
    expect(check.applies).toBe(false);
    expect(check.reasons).toHaveLength(1);
    expect(check.reasons[0]).toContain('5 anos');
    expect(check.reasons[0]).toContain('Requisito não informado');
    expect(check.reasons[0]).not.toContain('Marque');
  });

  it('without onlyProperty it is not exempt and explains', () => {
    const check = checkSingleProperty(
      caso({saleValue: 300000, singleProperty: {onlyProperty: false, noSaleIn5Years: true}}),
    );
    expect(check.applies).toBe(false);
    expect(check.reasons[0]).toContain('único imóvel');
  });

  it('an untouched block lists the requirements', () => {
    const check = checkSingleProperty(caso({saleValue: 300000}));
    expect(check.applies).toBe(false);
    expect(check.reasons).toHaveLength(2);
  });

  it('condominium compares the holder part', () => {
    const condo = {ownership: 'condominio' as const, quotaPct: 50, singleProperty: single};
    expect(checkSingleProperty(caso({...condo, saleValue: 880000})).applies).toBe(true);
    expect(checkSingleProperty(caso({...condo, saleValue: 880000.02})).applies).toBe(false);
  });

  it('marital community and exclusive ownership compare the whole', () => {
    for (const ownership of ['comunhao', 'exclusivo'] as const) {
      const input = caso({ownership, quotaPct: 50, saleValue: 600000, singleProperty: single});
      expect(checkSingleProperty(input).applies).toBe(false);
    }
  });

  describe('with prior parts of a sale in parts', () => {
    const check = (date: string, saleMode: CaseInput['saleMode'] = 'partes') =>
      checkSingleProperty(
        caso({
          contractDate: '2025-10-10',
          saleValue: 300000,
          saleMode,
          singleProperty: single,
          priorParts: [{id: 'a', date, gain: 1000, taxPaid: 150}],
        }),
      );

    it('a part on the 5th anniversary of the contract blocks it and explains', () => {
      const out = check('2020-10-10');
      expect(out.applies).toBe(false);
      expect(out.reasons).toHaveLength(1);
      expect(out.reasons[0]).toContain('parte anterior');
    });

    it('a part on the contract date blocks it', () => {
      expect(check('2025-10-10').applies).toBe(false);
    });

    it('a part one day further back does not block it', () => {
      expect(check('2020-10-09')).toEqual({applies: true, reasons: []});
    });

    it('parts left on the input of another mode do not count', () => {
      expect(check('2024-10-10', 'vista').applies).toBe(true);
      expect(check('2024-10-10', 'prazo').applies).toBe(true);
    });

    it('calculateCase keeps the tax when a recent part blocks the exemption', () => {
      const r = calculateCase(
        caso({
          ...base,
          saleValue: 300000,
          saleMode: 'partes',
          singleProperty: single,
          priorParts: [{id: 'a', date: '2025-02-10', gain: 1000, taxPaid: 150}],
        }),
      );
      expect(r.exemption.single.applies).toBe(false);
      expect(r.taxableBase).toBeGreaterThan(0);
    });
  });

  it('the limit uses the sale value before brokerage', () => {
    const input = caso({saleValue: 450000, brokerage: 20000, singleProperty: single});
    expect(checkSingleProperty(input).applies).toBe(false);
  });
});

describe('small value exemption', () => {
  it('case 13: 35,000 confirmed is exempt', () => {
    const check = checkSmallValue(caso({smallValue: {sameNatureMonthTotal: 35000, confirmed: true}}));
    expect(check).toEqual({applies: true, reasons: []});
  });

  it('case 14: 40,000 is not exempt and says why', () => {
    const check = checkSmallValue(caso({smallValue: {sameNatureMonthTotal: 40000, confirmed: true}}));
    expect(check.applies).toBe(false);
    expect(check.reasons[0]).toContain('supera o limite');
  });

  it('without confirmation it is not exempt and explains', () => {
    const check = checkSmallValue(caso({smallValue: {sameNatureMonthTotal: 10000, confirmed: false}}));
    expect(check.applies).toBe(false);
    expect(check.reasons).toHaveLength(1);
    expect(check.reasons[0]).toContain('Requisito não informado');
    expect(check.reasons[0]).not.toContain('na parte do titular');
  });

  it('an untouched block lists the requirement', () => {
    const check = checkSmallValue(caso({}));
    expect(check.applies).toBe(false);
    expect(check.reasons.length).toBeGreaterThan(0);
  });
});

describe('reinvestment', () => {
  it('case 7: 600,000 applied on 1,000,000 taxes 40%', () => {
    const input = caso({
      ...base,
      saleValue: 1000000,
      reinvestment: reinv({applications: [app('a', '2026-03-01', 600000)]}),
    });
    const out = reinvestmentOutcome(input, 1000000);
    expect(out.applied).toBe(600000);
    expect(out.proceeds).toBe(1000000);
    expect(out.taxedShare).toBeCloseTo(0.4, 12);
  });

  it('case 7 table before FR: 400,000 x 0.4 taxes 24,000', () => {
    expect(400000 * 0.4).toBeCloseTo(160000, 6);
    expect(progressiveTax(160000).total).toBeCloseTo(24000, 6);
  });

  it('day 180 counts and day 181 does not', () => {
    const input = (date: string) =>
      caso({
        contractDate: '2026-01-01',
        reinvestment: reinv({applications: [app('a', date, 500000)]}),
      });
    const on180 = reinvestmentOutcome(input('2026-06-30'), 1000000);
    expect(on180.deadline).toBe('2026-06-30');
    expect(on180.applied).toBe(500000);
    const on181 = reinvestmentOutcome(input('2026-07-01'), 1000000);
    expect(on181.deadline).toBe('2026-06-30');
    expect(on181.applied).toBe(0);
    expect(on181.taxedShare).toBe(1);
  });

  it('settlement applications count like acquisition ones', () => {
    const input = caso({
      contractDate: '2026-01-01',
      reinvestment: reinv({
        applications: [app('a', '2026-02-01', 300000), app('b', '2026-03-01', 200000, 'quitacao')],
      }),
    });
    expect(reinvestmentOutcome(input, 1000000).applied).toBe(500000);
  });

  it('an application without a date does not count', () => {
    const input = caso({
      contractDate: '2026-01-01',
      reinvestment: reinv({applications: [app('a', '', 500000)]}),
    });
    expect(reinvestmentOutcome(input, 1000000).applied).toBe(0);
  });

  it('with several sales the deadline counts from the first contract', () => {
    const input = caso({
      contractDate: '2026-03-01',
      reinvestment: reinv({
        moreThanOneSale: true,
        firstContractDate: '2026-01-01',
        applications: [app('a', '2026-07-01', 100000)],
      }),
    });
    const out = reinvestmentOutcome(input, 1000000);
    expect(out.deadline).toBe('2026-06-30');
    expect(out.applied).toBe(0);
  });

  it('applying more than the proceeds gives taxedShare 0', () => {
    const input = caso({
      contractDate: '2026-01-01',
      reinvestment: reinv({applications: [app('a', '2026-02-01', 2000000)]}),
    });
    expect(reinvestmentOutcome(input, 1000000).taxedShare).toBe(0);
  });

  it('proceeds of 0 gives taxedShare 1', () => {
    const input = caso({
      contractDate: '2026-01-01',
      reinvestment: reinv({applications: [app('a', '2026-02-01', 100000)]}),
    });
    expect(reinvestmentOutcome(input, 0).taxedShare).toBe(1);
  });

  describe('art. 39 is not applied', () => {
    const apps = [app('a', '2026-02-01', 600000)];
    const check = (partial: Partial<CaseInput>) =>
      reinvestmentOutcome(caso({contractDate: '2026-01-01', ...partial}), 1000000);

    it('when disabled', () => {
      const out = check({reinvestment: reinv({enabled: false, applications: apps})});
      expect(out).toEqual({deadline: null, applied: 0, proceeds: 1000000, taxedShare: 1});
    });

    it('when the property is not residential, and the deadline still shows', () => {
      const out = check({residential: false, reinvestment: reinv({applications: apps})});
      expect(out.taxedShare).toBe(1);
      expect(out.deadline).toBe('2026-06-30');
    });

    it('when the exemption was used in the last 5 years', () => {
      const out = check({reinvestment: reinv({applications: apps, usedInLast5Years: true})});
      expect(out.taxedShare).toBe(1);
      expect(out.deadline).toBe('2026-06-30');
    });

    it('when the property is land or a garage', () => {
      const out = check({reinvestment: reinv({applications: apps, landOrGarage: true})});
      expect(out.taxedShare).toBe(1);
      expect(out.deadline).toBe('2026-06-30');
    });
  });
});

describe('integration with calculateCase', () => {
  const sale = {...base, saleValue: 1000000, brokerage: 20000};
  const withCost = {...sale, costItems: [{id: 'c', description: 'compra', date: '2015-03-10', value: 400000, hasDocument: true}]};

  it('proceeds are the sale minus brokerage', () => {
    const r = calculateCase(caso({...sale, reinvestment: reinv({applications: [app('a', '2026-01-10', 490000)]})}));
    expect(r.reinvestment.proceeds).toBe(980000);
    expect(r.reinvestment.proceeds).toBe(r.saleNet);
    expect(r.reinvestment.taxedShare).toBeCloseTo(0.5, 12);
  });

  it('reinvestment scales the taxable base', () => {
    const plain = calculateCase(caso(withCost));
    const reinvested = calculateCase(
      caso({...withCost, reinvestment: reinv({applications: [app('a', '2026-01-10', 294000)]})}),
    );
    // proceeds 980,000; applied 294,000 -> taxed share 0.7
    expect(reinvested.reinvestment.taxedShare).toBeCloseTo(0.7, 12);
    expect(reinvested.gainAfterReductions).toBe(plain.gainAfterReductions);
    expect(reinvested.taxableBase).toBeCloseTo(plain.gainAfterReductions * 0.7, 6);
  });

  it('an applied exemption zeroes the tax and keeps the memory', () => {
    const plain = calculateCase(caso({...withCost, saleValue: 440000, brokerage: 0}));
    expect(plain.taxDue).toBeGreaterThan(0);
    const r = calculateCase(caso({...withCost, saleValue: 440000, brokerage: 0, singleProperty: single}));
    expect(r.exemption.single.applies).toBe(true);
    expect(r.items).toEqual(plain.items);
    expect(r.gainAfterReductions).toBe(plain.gainAfterReductions);
    expect(r.gainAfterReductions).toBeGreaterThan(0);
    expect(r.taxableBase).toBe(0);
    expect(r.taxDue).toBe(0);
    expect(r.brackets).toEqual([]);
    expect(r.taxPayable).toBe(0);
  });

  it('small value exempts as well', () => {
    const r = calculateCase(
      caso({
        ...base,
        saleValue: 30000,
        smallValue: {sameNatureMonthTotal: 30000, confirmed: true},
      }),
    );
    expect(r.exemption.small.applies).toBe(true);
    expect(r.taxDue).toBe(0);
  });
});

describe('fix round 1', () => {
  const ready = {...base, saleValue: 500000};

  it('applications before the contract do not count; the contract day does', () => {
    const input = (date: string) =>
      caso({contractDate: '2026-01-10', reinvestment: reinv({applications: [app('a', date, 100000)]})});
    expect(reinvestmentOutcome(input('2026-01-09'), 1000000).applied).toBe(0);
    expect(reinvestmentOutcome(input('2026-01-10'), 1000000).applied).toBe(100000);
  });

  it('with several sales, an application between the first contract and this one does not count', () => {
    const input = caso({
      contractDate: '2026-03-01',
      reinvestment: reinv({
        moreThanOneSale: true,
        firstContractDate: '2026-01-01',
        applications: [app('a', '2026-02-01', 100000), app('b', '2026-03-01', 50000)],
      }),
    });
    expect(reinvestmentOutcome(input, 1000000).applied).toBe(50000);
  });

  it('firstContractDate is ignored without moreThanOneSale', () => {
    const input = caso({
      contractDate: '2026-03-01',
      reinvestment: reinv({firstContractDate: '2026-01-01'}),
    });
    expect(reinvestmentOutcome(input, 1000000).deadline).toBe('2026-08-28');
  });

  it('empty firstContractDate with moreThanOneSale falls back to the contract', () => {
    const input = caso({contractDate: '2026-01-01', reinvestment: reinv({moreThanOneSale: true})});
    expect(reinvestmentOutcome(input, 1000000).deadline).toBe('2026-06-30');
    expect(calculateCase(caso({...ready, reinvestment: reinv({moreThanOneSale: true})})).status).toBe('ok');
  });

  it('malformed or later firstContractDate is invalid', () => {
    const run = (firstContractDate: string) =>
      calculateCase(caso({...ready, reinvestment: reinv({moreThanOneSale: true, firstContractDate})}));
    const bad = run('2025-02-30');
    expect(bad.status).toBe('invalido');
    expect(bad.missing[0]).toContain('primeiro contrato');
    const late = run('2025-11-01');
    expect(late.status).toBe('invalido');
    expect(late.missing[0]).toContain('posterior');
    expect(run('2025-09-01').status).toBe('ok');
  });

  it('firstContractDate is not validated without moreThanOneSale or when disabled', () => {
    expect(calculateCase(caso({...ready, reinvestment: reinv({firstContractDate: 'x'})})).status).toBe('ok');
    const off = reinv({enabled: false, moreThanOneSale: true, firstContractDate: 'x'});
    expect(calculateCase(caso({...ready, reinvestment: off})).status).toBe('ok');
  });

  it('small value counts this sale in the month total', () => {
    const check = checkSmallValue(
      caso({saleValue: 1000000, smallValue: {sameNatureMonthTotal: 0, confirmed: true}}),
    );
    expect(check.applies).toBe(false);
    expect(check.reasons[0]).toContain('supera o limite');
  });

  it('quota 55 on 800,000 is exactly 440,000 and the single exemption applies', () => {
    const input = caso({saleValue: 800000, ownership: 'condominio', quotaPct: 55, singleProperty: single});
    expect(checkSingleProperty(input).applies).toBe(true);
    const r = calculateCase(caso({...ready, saleValue: 800000, ownership: 'condominio', quotaPct: 55}));
    expect(r.saleNet).toBe(440000);
  });

  it('application values are validated when reinvestment is enabled', () => {
    for (const value of [-1, NaN, Infinity, 1e16]) {
      const r = calculateCase(caso({...ready, reinvestment: reinv({applications: [app('a', '2026-01-10', value)]})}));
      expect(r.status).toBe('invalido');
    }
    const off = reinv({enabled: false, applications: [app('a', '2026-01-10', -1)]});
    expect(calculateCase(caso({...ready, reinvestment: off})).status).toBe('ok');
  });
});

describe('reinvestment deadline and counted applications', () => {
  it('the deadline is the 180th day from the contract, or from the first contract with several sales', () => {
    expect(reinvestmentDeadline(caso({...base, reinvestment: reinv({})}))).toBe('2026-04-08');
    const several = reinv({moreThanOneSale: true, firstContractDate: '2025-09-10'});
    expect(reinvestmentDeadline(caso({...base, reinvestment: several}))).toBe('2026-03-09');
    const blank = reinv({moreThanOneSale: true, firstContractDate: ' '});
    expect(reinvestmentDeadline(caso({...base, reinvestment: blank}))).toBe('2026-04-08');
    const ignored = reinv({moreThanOneSale: false, firstContractDate: '2025-09-10'});
    expect(reinvestmentDeadline(caso({...base, reinvestment: ignored}))).toBe('2026-04-08');
    expect(reinvestmentDeadline(caso({contractDate: '', reinvestment: reinv({})}))).toBeNull();
  });

  it('counts only dated applications with value between the contract and the deadline', () => {
    const input = caso({...base, reinvestment: reinv({})});
    const deadline = reinvestmentDeadline(input);
    expect(isApplicationCounted(input, app('a', '2025-10-10', 1), deadline)).toBe(true);
    expect(isApplicationCounted(input, app('a', '2026-04-08', 1), deadline)).toBe(true);
    expect(isApplicationCounted(input, app('a', '2026-04-09', 1), deadline)).toBe(false);
    expect(isApplicationCounted(input, app('a', '2025-10-09', 1), deadline)).toBe(false);
    expect(isApplicationCounted(input, app('a', '', 1), deadline)).toBe(false);
    expect(isApplicationCounted(input, app('a', '2025-11-10', 0), deadline)).toBe(false);
    expect(isApplicationCounted(input, app('a', '2025-11-10', 1), null)).toBe(false);
  });

  it('the outcome sums exactly the counted applications', () => {
    const apps = [app('a', '2025-11-10', 100), app('b', '2026-04-09', 1000), app('c', '2026-01-10', 10, 'quitacao')];
    const input = caso({...base, reinvestment: reinv({applications: apps})});
    const deadline = reinvestmentDeadline(input);
    const counted = apps.filter((a) => isApplicationCounted(input, a, deadline)).reduce((sum, a) => sum + a.value, 0);
    expect(reinvestmentOutcome(input, 1000000).applied).toBe(counted);
    expect(counted).toBe(110);
  });
});
