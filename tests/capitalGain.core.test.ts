import {describe, expect, it} from 'vitest';
import {
  art18Percent,
  calculateCase,
  correctedCost,
  countM1,
  countM2,
  defaultCaseInput,
  factorFR1,
  factorFR2,
  progressiveTax,
} from '../src/utils/capitalGain';
import {formatFactor, round2} from '../src/utils/format';
import type {CaseInput, CostItem} from '../src/types';

function caso(partial: Partial<CaseInput>): CaseInput {
  return {...defaultCaseInput(), ...partial};
}

function item(id: string, date: string, value: number, extra: Partial<CostItem> = {}): CostItem {
  return {id, description: id, date, value, hasDocument: true, ...extra};
}

// Walks every number in a result. Only the open upper limit of the top bracket may be infinite.
function expectFiniteNumbers(value: unknown, path = 'result'): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), path).toBe(true);
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => expectFiniteNumbers(entry, `${path}[${index}]`));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'to' && entry === Infinity) continue;
      expectFiniteNumbers(entry, `${path}.${key}`);
    }
  }
}

describe('official cases', () => {
  it('case 1: m1 = 0 and m2 = 195', () => {
    expect(formatFactor(factorFR2(195))).toBe('0,505955');
    const base = 700000 * factorFR2(195);
    expect(round2(base)).toBe(354168.2);
    expect(round2(progressiveTax(base).total)).toBe(53125.23);
  });

  it('case 1 through calculateCase', () => {
    const r = calculateCase(
      caso({
        acquisitionDate: '2009-08-10',
        contractDate: '2025-10-10',
        saleValue: 1000000,
        costItems: [item('compra', '2009-08-10', 300000)],
      }),
    );
    expect(r.status).toBe('ok');
    expect(r.grossGain).toBe(700000);
    expect(r.items[0].m1).toBe(0);
    expect(r.items[0].m2).toBe(195);
    expect(round2(r.taxableBase)).toBe(354168.2);
    expect(round2(r.taxDue)).toBe(53125.23);
    expect(r.taxPayable).toBe(r.taxDue);
  });

  it('case 2: m1 = 70 and m2 = 246', () => {
    expect(formatFactor(factorFR1(70))).toBe('0,657872');
    expect(formatFactor(factorFR2(246))).toBe('0,423375');
    const r = calculateCase(
      caso({
        acquisitionDate: '2000-02-10',
        contractDate: '2026-05-15',
        saleValue: 1500000,
        costItems: [item('compra', '2000-02-10', 500000)],
      }),
    );
    expect(r.items[0].m1).toBe(70);
    expect(r.items[0].m2).toBe(246);
    expect(round2(r.taxableBase)).toBe(278526.58);
    expect(round2(r.taxDue)).toBe(41778.99);
  });

  it('case 3: three brackets', () => {
    const {brackets, total} = progressiveTax(12000000);
    expect(total).toBe(2025000);
    expect(brackets.map((b) => b.tax)).toEqual([750000, 875000, 400000]);
  });

  it('exact bracket limits', () => {
    const atLimit = progressiveTax(5000000);
    expect(atLimit.total).toBe(750000);
    expect(atLimit.brackets).toHaveLength(1);
    const above = progressiveTax(5000000.01);
    expect(above.brackets).toHaveLength(2);
    expect(above.brackets[1].base).toBeCloseTo(0.01, 6);
  });

  it('no base gives no bracket and no tax', () => {
    expect(progressiveTax(0)).toEqual({brackets: [], total: 0});
  });

  it('cases 4, 5 and 6: art. 18 percent', () => {
    expect(art18Percent(1985)).toBe(0.2);
    expect(art18Percent(1969)).toBe(1);
    expect(art18Percent(1989)).toBe(0);
  });

  it('case 4: 1985 property keeps 80% of the gain before FR', () => {
    const r = calculateCase(
      caso({
        acquisitionDate: '1985-06-10',
        contractDate: '2025-10-10',
        saleValue: 150000,
        costItems: [item('compra', '1985-06-10', 50000)],
      }),
    );
    const line = r.items[0];
    expect(line.gain).toBe(100000);
    expect(line.art18Pct).toBe(0.2);
    expect(line.reducedGain).toBeCloseTo(80000 * line.fr1 * line.fr2, 6);
  });

  it('case 5: 1969 property has no tax', () => {
    const r = calculateCase(
      caso({
        acquisitionDate: '1969-06-10',
        contractDate: '2025-10-10',
        saleValue: 900000,
        costItems: [item('compra', '1969-06-10', 100000)],
      }),
    );
    expect(r.status).toBe('ok');
    expect(r.grossGain).toBe(800000);
    expect(r.taxDue).toBe(0);
  });

  it('case 6: 1989 property has no art. 18 reduction', () => {
    const r = calculateCase(
      caso({
        acquisitionDate: '1989-01-01',
        contractDate: '2025-10-10',
        saleValue: 900000,
        costItems: [item('compra', '1989-01-01', 100000)],
      }),
    );
    expect(r.items[0].art18Pct).toBe(0);
  });

  it('case 16: negative gain has no tax and no negative base', () => {
    const r = calculateCase(
      caso({
        acquisitionDate: '2015-03-10',
        contractDate: '2025-10-10',
        saleValue: 100000,
        costItems: [item('compra', '2015-03-10', 150000)],
      }),
    );
    expect(r.status).toBe('ok');
    expect(r.grossGain).toBe(-50000);
    expect(r.gainAfterReductions).toBe(0);
    expect(r.taxableBase).toBe(0);
    expect(r.taxDue).toBe(0);
    expect(r.brackets).toEqual([]);
  });

  it('case 17: official Perguntao example', () => {
    expect(countM1('1995-05-31')).toBe(119);
    expect(countM2('1995-05-31', '2025-10-10')).toBe(239);
    expect(((1 - factorFR1(119)) * 100).toFixed(6)).toBe('50.927262');
    expect(((1 - factorFR2(239)) * 100).toFixed(6)).toBe('56.614267');
  });

  it('case 18: acquisition in Nov/2005 after the 1st', () => {
    expect(countM1('2005-11-15')).toBe(1);
    expect(countM2('2005-11-15', '2005-12-20')).toBe(1);
  });

  it('case 19: acquisition after Dec/2005 counts its own month', () => {
    expect(countM1('2010-03-10')).toBe(0);
    expect(countM2('2010-03-10', '2011-03-20')).toBe(13);
  });
});

describe('split of the gain by cost item', () => {
  it('weights each item and uses its own m1 and m2', () => {
    const r = calculateCase(
      caso({
        acquisitionDate: '2000-06-10',
        contractDate: '2025-10-10',
        saleValue: 800000,
        costItems: [item('compra', '2000-06-10', 300000), item('reforma', '2015-04-10', 100000)],
      }),
    );
    const [a, b] = r.items;
    expect(r.grossGain).toBe(400000);
    expect(a.share).toBe(0.75);
    expect(b.share).toBe(0.25);
    expect(a.gain).toBe(300000);
    expect(b.gain).toBe(100000);
    expect(a.m1).toBe(countM1('2000-06-10'));
    expect(a.m2).toBe(countM2('2000-06-10', '2025-10-10'));
    expect(b.m1).toBe(0);
    expect(b.m2).toBe(countM2('2015-04-10', '2025-10-10'));
    expect(a.m2).toBeGreaterThan(b.m2);
    expect(r.gainAfterReductions).toBeCloseTo(
      300000 * factorFR1(a.m1) * factorFR2(a.m2) + 100000 * factorFR2(b.m2),
      6,
    );
  });

  it('zero cost uses one virtual item at the acquisition date', () => {
    const r = calculateCase(
      caso({acquisitionDate: '2010-03-10', contractDate: '2011-03-20', saleValue: 100000}),
    );
    expect(r.status).toBe('ok');
    expect(r.totalCost).toBe(0);
    expect(r.grossGain).toBe(100000);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].share).toBe(1);
    expect(r.items[0].m2).toBe(13);
    expect(r.gainAfterReductions).toBeCloseTo(100000 * factorFR2(13), 6);
  });
});

describe('land rule', () => {
  const sale = '2025-10-10';
  const terreno = item('terreno', '1985-06-10', 300000, {isLand: true});
  const landCase = (obraDate: string) =>
    calculateCase(
      caso({
        acquisitionDate: '1985-06-10',
        contractDate: sale,
        saleValue: 1000000,
        landRule: true,
        costItems: [terreno, item('obra', obraDate, 100000)],
      }),
    );

  it('construction up to 1988: land date for art. 18 and factors on the whole gain', () => {
    const r = landCase('1987-02-10');
    expect(r.status).toBe('ok');
    for (const line of r.items) {
      expect(line.art18Pct).toBe(0.2);
      expect(line.m1).toBe(119);
      expect(line.m2).toBe(countM2('1985-06-10', sale));
    }
    expect(r.gainAfterReductions).toBeCloseTo(600000 * 0.8 * factorFR1(119) * factorFR2(r.items[0].m2), 6);
  });

  it('construction from 1989 to 1995: land factors, art. 18 only on the land share', () => {
    const r = landCase('1990-02-10');
    const [land, obra] = r.items;
    expect(land.art18Pct).toBe(0.2);
    expect(obra.art18Pct).toBe(0);
    expect(obra.m1).toBe(land.m1);
    expect(obra.m2).toBe(land.m2);
    expect(r.gainAfterReductions).toBeCloseTo(
      (450000 * 0.8 + 150000) * factorFR1(119) * factorFR2(land.m2),
      6,
    );
  });

  it('construction after 1995: each item with its own date', () => {
    const r = landCase('1997-02-10');
    const [land, obra] = r.items;
    expect(land.art18Pct).toBe(0.2);
    expect(land.m1).toBe(119);
    expect(obra.art18Pct).toBe(0);
    expect(obra.m1).toBe(countM1('1997-02-10'));
    expect(obra.m1).toBeLessThan(119);
  });

  it('construction on 1988-12-31 still takes the land date for art. 18', () => {
    const [land, obra] = landCase('1988-12-31').items;
    expect(land.art18Pct).toBe(0.2);
    expect(obra.art18Pct).toBe(0.2);
  });

  it('construction on 1989-01-01 has no art. 18 reduction', () => {
    const [land, obra] = landCase('1989-01-01').items;
    expect(land.art18Pct).toBe(0.2);
    expect(obra.art18Pct).toBe(0);
    expect(obra.m1).toBe(land.m1);
    expect(obra.m2).toBe(land.m2);
  });

  it('without the option each item keeps its own date', () => {
    const r = calculateCase(
      caso({
        acquisitionDate: '1985-06-10',
        contractDate: sale,
        saleValue: 1000000,
        costItems: [terreno, item('obra', '1987-02-10', 100000)],
      }),
    );
    expect(r.items[1].art18Pct).toBe(art18Percent(1987));
  });

  it('option without a land item is incomplete', () => {
    const r = calculateCase(
      caso({
        acquisitionDate: '1985-06-10',
        contractDate: sale,
        saleValue: 1000000,
        landRule: true,
        costItems: [item('obra', '1987-02-10', 100000)],
      }),
    );
    expect(r.status).toBe('incompleto');
    expect(r.missing).toEqual(['Terreno (item de custo marcado)']);
  });
});

describe('sale value', () => {
  const base = {acquisitionDate: '2015-03-10', contractDate: '2025-10-10', saleValue: 1000000};

  it('condominium takes the quota before brokerage', () => {
    expect(calculateCase(caso({...base, ownership: 'condominio', quotaPct: 50})).saleNet).toBe(500000);
    expect(
      calculateCase(caso({...base, ownership: 'condominio', quotaPct: 50, brokerage: 10000})).saleNet,
    ).toBe(490000);
  });

  it('marital community ignores the quota', () => {
    expect(calculateCase(caso({...base, ownership: 'comunhao', quotaPct: 50})).saleNet).toBe(1000000);
  });

  it('brokerage comes off the sale value', () => {
    expect(calculateCase(caso({...base, brokerage: 60000})).saleNet).toBe(940000);
  });

  const withCost = {...base, brokerage: 10000, quotaPct: 50, costItems: [item('compra', '2015-03-10', 400000)]};

  it('condominium scales sale and cost by the quota, not brokerage', () => {
    const r = calculateCase(caso({...withCost, ownership: 'condominio'}));
    expect(r.saleNet).toBe(490000);
    expect(r.totalCost).toBe(200000);
    expect(r.grossGain).toBe(290000);
    expect(r.items[0].share).toBe(1);
  });

  it('condominium keeps the split between items', () => {
    const r = calculateCase(
      caso({
        ...base,
        ownership: 'condominio',
        quotaPct: 50,
        costItems: [item('compra', '2015-03-10', 300000), item('reforma', '2018-03-10', 100000)],
      }),
    );
    expect(r.totalCost).toBe(200000);
    expect(r.items.map((line) => line.share)).toEqual([0.75, 0.25]);
  });

  it('exclusive and marital community ignore the quota on sale and cost', () => {
    for (const ownership of ['exclusivo', 'comunhao'] as const) {
      const r = calculateCase(caso({...withCost, ownership}));
      expect(r.saleNet).toBe(990000);
      expect(r.totalCost).toBe(400000);
      expect(r.grossGain).toBe(590000);
    }
  });

  it('correctedCost stays unscaled', () => {
    expect(correctedCost(item('compra', '2015-03-10', 400000))).toBe(400000);
  });
});

describe('correctedCost', () => {
  it('divides the original amount by the Anexo Unico index', () => {
    const cost = item('compra', '1995-12-10', 0, {original: {amount: 10000, moeda: 'Reais'}});
    expect(correctedCost(cost)).toBe(10000 / 0.9596);
  });

  it('manual value wins over the default', () => {
    const cost = item('compra', '1995-12-10', 12345, {
      original: {amount: 10000, moeda: 'Reais'},
      manual: true,
    });
    expect(correctedCost(cost)).toBe(12345);
  });

  it('cost from 1996 on is not corrected', () => {
    expect(correctedCost(item('compra', '1996-01-10', 5000))).toBe(5000);
    const late = item('compra', '1996-01-10', 5000, {original: {amount: 10000, moeda: 'Reais'}});
    expect(correctedCost(late)).toBe(5000);
  });

  it('feeds the total cost', () => {
    const r = calculateCase(
      caso({
        acquisitionDate: '1995-12-10',
        contractDate: '2025-10-10',
        saleValue: 100000,
        costItems: [item('compra', '1995-12-10', 0, {original: {amount: 10000, moeda: 'Reais'}})],
      }),
    );
    expect(r.status).toBe('ok');
    expect(r.totalCost).toBe(10000 / 0.9596);
  });

  it('a month without index is invalid, never NaN', () => {
    const r = calculateCase(
      caso({
        acquisitionDate: '1993-01-10',
        contractDate: '2025-10-10',
        saleValue: 100000,
        costItems: [item('compra', '1993-01-10', 0, {original: {amount: 10000, moeda: 'Reais'}})],
      }),
    );
    expect(r.status).toBe('invalido');
    expect(r.missing).toHaveLength(1);
  });
});

describe('numeric fields of the result', () => {
  const ready = {acquisitionDate: '2015-03-10', contractDate: '2025-10-10', saleValue: 500000};
  const inputs: Partial<CaseInput>[] = [
    {},
    {acquisitionDate: '2015-03-10'},
    {contractDate: '2025-10-10'},
    {saleValue: 500000},
    {acquisitionDate: '2015-03-10', contractDate: '2025-10-10'},
    {...ready, costItems: [item('a', '', 0)]},
    {...ready, costItems: [item('a', '2015-03-10', Infinity)]},
    {...ready, ownership: 'condominio', quotaPct: 0},
    {...ready, ownership: 'condominio', quotaPct: NaN},
    {...ready, saleValue: NaN},
    {...ready, saleValue: 1e308, ownership: 'condominio', quotaPct: 50},
    {...ready, landRule: true},
    ready,
    {...ready, saleValue: 1e15},
  ];

  it('are finite for partial, invalid and complete inputs', () => {
    for (const partial of inputs) expectFiniteNumbers(calculateCase(caso(partial)));
  });

  it('the walk reaches nested numbers and rejects NaN', () => {
    expect(() => expectFiniteNumbers({items: [{gain: NaN}]})).toThrow();
    expect(() => expectFiniteNumbers({to: NaN})).toThrow();
  });
});

describe('incomplete input', () => {
  it('default input is incomplete', () => {
    const r = calculateCase(defaultCaseInput());
    expect(r.status).toBe('incompleto');
    expect(r.missing).toEqual(['Data de aquisição', 'Data de alienação', 'Valor de alienação']);
    for (const value of [r.saleNet, r.totalCost, r.grossGain, r.taxableBase, r.taxDue, r.taxPayable]) {
      expect(value).toBe(0);
    }
    expect(r.reinvestment).toEqual({deadline: null, applied: 0, proceeds: 0, taxedShare: 0});
  });

  const ready = {acquisitionDate: '2015-03-10', contractDate: '2025-10-10', saleValue: 500000};

  it('ignores an untouched cost row', () => {
    const r = calculateCase(caso({...ready, costItems: [item('novo', '', 0, {description: ''})]}));
    expect(r.status).toBe('ok');
    expect(r.totalCost).toBe(0);
  });

  it('a zero item with a date or a description is incomplete', () => {
    const dated = calculateCase(caso({...ready, costItems: [item('a', '2015-03-10', 0)]}));
    expect(dated.status).toBe('incompleto');
    expect(dated.missing).toEqual(['Valor do item de custo']);
    const described = calculateCase(caso({...ready, costItems: [item('a', '', 0)]}));
    expect(described.status).toBe('incompleto');
  });

  it('an item with value and no date is incomplete', () => {
    const r = calculateCase(caso({...ready, costItems: [item('a', '', 1000)]}));
    expect(r.status).toBe('incompleto');
    expect(r.missing).toEqual(['Data do item de custo']);
  });

  it('repeated labels appear once', () => {
    const r = calculateCase(caso({...ready, costItems: [item('a', '', 1000), item('b', '', 2000)]}));
    expect(r.missing).toEqual(['Data do item de custo']);
  });

  it('condominium without quota is incomplete', () => {
    const r = calculateCase(caso({...ready, ownership: 'condominio', quotaPct: 0}));
    expect(r.status).toBe('incompleto');
    expect(r.missing).toEqual(['Percentual da quota']);
  });
});

describe('invalid input', () => {
  const ready = {acquisitionDate: '2015-03-10', contractDate: '2025-10-10', saleValue: 500000};

  it('sale before acquisition', () => {
    const r = calculateCase(caso({...ready, acquisitionDate: '2026-01-10'}));
    expect(r.status).toBe('invalido');
    expect(r.missing).toEqual(['A data de alienação não pode ser anterior à data de aquisição.']);
    expect(r.taxDue).toBe(0);
    expect(r.items).toEqual([]);
  });

  it('cost item after the sale', () => {
    const r = calculateCase(caso({...ready, costItems: [item('reforma', '2025-10-11', 1000)]}));
    expect(r.status).toBe('invalido');
    expect(r.missing).toHaveLength(1);
  });

  it('a cost item on the sale date is accepted', () => {
    const r = calculateCase(caso({...ready, costItems: [item('reforma', '2025-10-10', 1000)]}));
    expect(r.status).toBe('ok');
  });

  it('cost item before the acquisition date', () => {
    const r = calculateCase(caso({...ready, costItems: [item('transferencia', '2010-01-10', 1000)]}));
    expect(r.status).toBe('invalido');
    expect(r.missing).toEqual(['O item de custo "transferencia" tem data anterior à aquisição.']);
    expect(r.items).toEqual([]);
  });

  it('property bought in stages is valid when acquisitionDate is the earliest date', () => {
    const r = calculateCase(
      caso({
        ...ready,
        costItems: [item('entrada', '2015-03-10', 1000), item('saldo', '2016-05-10', 2000)],
      }),
    );
    expect(r.status).toBe('ok');
    expect(r.totalCost).toBe(3000);
  });

  it('amounts above 1e15 are invalid', () => {
    expect(calculateCase(caso({...ready, saleValue: 1e15})).status).toBe('ok');
    expect(calculateCase(caso({...ready, saleValue: 1e16})).status).toBe('invalido');
    expect(
      calculateCase(caso({...ready, saleValue: 1e308, ownership: 'condominio', quotaPct: 50})).status,
    ).toBe('invalido');
    expect(calculateCase(caso({...ready, brokerage: 1e16})).status).toBe('invalido');
    expect(calculateCase(caso({...ready, costItems: [item('a', '2015-03-10', 1e16)]})).status).toBe('invalido');
    const original = item('a', '2015-03-10', 1000, {original: {amount: 1e16, moeda: 'Reais'}});
    expect(calculateCase(caso({...ready, costItems: [original]})).status).toBe('invalido');
  });

  it('impossible date', () => {
    expect(calculateCase(caso({...ready, contractDate: '2025-02-30'})).status).toBe('invalido');
  });

  it('negative or non-numeric values', () => {
    expect(calculateCase(caso({...ready, saleValue: -1})).status).toBe('invalido');
    expect(calculateCase(caso({...ready, saleValue: NaN})).status).toBe('invalido');
    expect(calculateCase(caso({...ready, brokerage: -1})).status).toBe('invalido');
    expect(calculateCase(caso({...ready, brokerage: 500001})).status).toBe('invalido');
    expect(calculateCase(caso({...ready, costItems: [item('a', '2015-03-10', -1)]})).status).toBe('invalido');
    expect(calculateCase(caso({...ready, ownership: 'condominio', quotaPct: 101})).status).toBe('invalido');
  });

  it('also lists what is missing', () => {
    const r = calculateCase(caso({acquisitionDate: '2026-01-10', contractDate: '2025-10-10'}));
    expect(r.status).toBe('invalido');
    expect(r.missing).toEqual([
      'A data de alienação não pode ser anterior à data de aquisição.',
      'Valor de alienação',
    ]);
  });
});

describe('scope', () => {
  const ready = {acquisitionDate: '2015-03-10', contractDate: '2025-10-10', saleValue: 500000};

  it('declared out of scope', () => {
    const r = calculateCase(caso({...ready, outOfScope: ['exterior']}));
    expect(r.status).toBe('fora_de_escopo');
    expect(r.missing).toHaveLength(1);
    expect(r.taxDue).toBe(0);
  });

  it('sale before 01/12/2005', () => {
    const r = calculateCase(caso({...ready, acquisitionDate: '2000-03-10', contractDate: '2005-11-30'}));
    expect(r.status).toBe('fora_de_escopo');
    expect(r.missing).toHaveLength(1);
  });

  it('sale on 01/12/2005 is calculated', () => {
    const r = calculateCase(caso({...ready, acquisitionDate: '2000-03-10', contractDate: '2005-12-01'}));
    expect(r.status).toBe('ok');
  });
});

describe('defaults until the next tasks', () => {
  it('returns no exemption or reinvestment by default and one schedule line', () => {
    const r = calculateCase(
      caso({acquisitionDate: '2015-03-10', contractDate: '2025-10-10', saleValue: 500000, brokerage: 1000}),
    );
    expect(r.exemption.small.applies).toBe(false);
    expect(r.exemption.single.applies).toBe(false);
    expect(r.reinvestment).toEqual({deadline: null, applied: 0, proceeds: 499000, taxedShare: 1});
    expect(r.schedule).toHaveLength(1);
    expect(r.priorTaxPaid).toBe(0);
    expect(r.taxPayable).toBe(r.taxDue);
  });
});
