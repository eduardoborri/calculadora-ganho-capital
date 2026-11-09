import {describe, expect, it} from 'vitest';
import {calculateCase, defaultCaseInput, progressiveTax} from '../src/utils/capitalGain';
import {formatCurrency} from '../src/utils/format';
import {applyPriorParts, buildSchedule, saleModeAlerts} from '../src/utils/saleModes';
import type {Alert, CaseInput, CaseResult, CostItem, Installment, PriorPart} from '../src/types';

function caso(partial: Partial<CaseInput>): CaseInput {
  return {...defaultCaseInput(), ...partial};
}

function parcela(id: string, date: string, value: number, brokerage = 0): Installment {
  return {id, date, value, brokerage};
}

function parte(id: string, date: string, gain: number, taxPaid: number): PriorPart {
  return {id, date, gain, taxPaid};
}

function item(id: string, date: string, value: number): CostItem {
  return {id, description: id, date, value, hasDocument: true};
}

// Alerts of this module only: the builder of Task 6 adds others to every case.
function modeAlerts(r: CaseResult): Alert[] {
  return r.alerts.filter((alert) => ['parcelas-diferenca', 'prazo-progressiva'].includes(alert.id));
}

const base = {acquisitionDate: '2015-03-10', contractDate: '2025-10-10', saleValue: 1000000};
const prazo = {...base, saleMode: 'prazo' as const};
const partes = {...base, saleMode: 'partes' as const};
const custo = [item('compra', '2015-03-10', 300000)];
const total = parcela('p', '2025-10-15', 1000000);

describe('schedule of an installment sale', () => {
  it('case 8: installment of 250,000 on a gain of 400,000 over 1,000,000', () => {
    const input = caso({...prazo, installments: [parcela('a', '2025-10-15', 250000)]});
    const lines = buildSchedule(input, 400000, 60000);
    expect(lines).toHaveLength(1);
    expect(lines[0].month).toBe('2025-10');
    expect(lines[0].received).toBe(250000);
    expect(lines[0].gain).toBeCloseTo(100000, 6);
    expect(lines[0].tax).toBeCloseTo(15000, 6);
    expect(lines[0].dueDate).toBe('2025-11-28');
  });

  it('installments of the same month become one line due the next month', () => {
    const input = caso({
      ...prazo,
      installments: [parcela('a', '2025-11-03', 100000), parcela('b', '2025-11-27', 150000)],
    });
    const lines = buildSchedule(input, 400000, 60000);
    expect(lines).toHaveLength(1);
    expect(lines[0].received).toBe(250000);
    expect(lines[0].gain).toBeCloseTo(100000, 6);
    expect(lines[0].dueDate).toBe('2025-12-31');
  });

  it('lines come sorted by month, whatever the typing order', () => {
    const input = caso({
      ...prazo,
      installments: [
        parcela('a', '2026-01-05', 100000),
        parcela('b', '2025-12-20', 100000),
        parcela('c', '2025-10-11', 100000),
      ],
    });
    const lines = buildSchedule(input, 400000, 60000);
    expect(lines.map((line) => line.month)).toEqual(['2025-10', '2025-12', '2026-01']);
    expect(lines.map((line) => line.dueDate)).toEqual(['2025-11-28', '2026-01-30', '2026-02-27']);
  });

  it('installment brokerage comes off the gain, and received stays gross', () => {
    const input = caso({...prazo, installments: [parcela('a', '2025-10-15', 250000, 10000)]});
    const [line] = buildSchedule(input, 400000, 60000);
    expect(line.received).toBe(250000);
    expect(line.gain).toBeCloseTo(240000 * 0.4, 6);
    expect(line.tax).toBeCloseTo(240000 * 0.4 * 0.15, 6);
  });

  it('brokerage of the month adds up across its installments', () => {
    const input = caso({
      ...prazo,
      installments: [parcela('a', '2025-10-15', 100000, 4000), parcela('b', '2025-10-20', 150000, 6000)],
    });
    const lines = buildSchedule(input, 400000, 60000);
    expect(lines).toHaveLength(1);
    expect(lines[0].gain).toBeCloseTo(240000 * 0.4, 6);
  });

  it('the ratio uses the holder share in a condominium', () => {
    const input = caso({
      ...prazo,
      saleValue: 2000000,
      ownership: 'condominio',
      quotaPct: 50,
      installments: [parcela('a', '2025-10-15', 250000)],
    });
    expect(buildSchedule(input, 400000, 60000)[0].gain).toBeCloseTo(100000, 6);
  });

  it('gain of zero keeps the lines without tax and without dividing by zero', () => {
    const input = caso({...prazo, installments: [parcela('a', '2025-10-15', 250000, 10000)]});
    const lines = buildSchedule(input, 0, 0);
    expect(lines).toHaveLength(1);
    expect(lines[0].gain).toBe(0);
    expect(lines[0].tax).toBe(0);
    expect(lines[0].received).toBe(250000);
  });

  it('gain above 5,000,000: lines are proportional to the table total and add up to it', () => {
    const input = caso({
      ...prazo,
      saleValue: 10000000,
      installments: [parcela('a', '2025-10-15', 4000000), parcela('b', '2025-11-15', 6000000)],
    });
    const lines = buildSchedule(input, 7000000, 1100000);
    expect(lines[0].gain).toBeCloseTo(2800000, 4);
    expect(lines[0].tax).toBeCloseTo(440000, 4);
    expect(lines[1].gain).toBeCloseTo(4200000, 4);
    expect(lines[1].tax).toBeCloseTo(660000, 4);
    expect(lines[0].tax + lines[1].tax).toBeCloseTo(1100000, 4);
  });
});

describe('deduction in the schedule of an installment sale', () => {
  const sale = {...prazo, saleValue: 1500000};
  const lineTaxes = (installments: Installment[], deduction: number) =>
    buildSchedule(caso({...sale, installments}), 164000, 24600, deduction).map((line) => line.tax);
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

  it('follows the amount received: 24,600 x 0.98 - 10,000 is 14,108', () => {
    const taxes = lineTaxes(
      [parcela('a', '2025-10-15', 750000, 15000), parcela('b', '2025-11-15', 750000, 15000)],
      10000,
    );
    expect(taxes[0]).toBeCloseTo(7054, 6);
    expect(taxes[1]).toBeCloseTo(7054, 6);
    expect(sum(taxes)).toBeCloseTo(14108, 6);
  });

  it('what a line cannot absorb moves to a later line', () => {
    const taxes = lineTaxes(
      [parcela('a', '2025-10-15', 750000, 749000), parcela('b', '2025-11-15', 750000)],
      10000,
    );
    expect(taxes[0]).toBe(0);
    expect(sum(taxes)).toBeCloseTo(24600 * (1 - 749000 / 1500000) - 10000, 6);
  });

  it('what the last line cannot absorb moves back to an earlier line', () => {
    const taxes = lineTaxes(
      [parcela('a', '2025-10-15', 750000), parcela('b', '2025-11-15', 750000, 749000)],
      10000,
    );
    expect(taxes[1]).toBe(0);
    expect(sum(taxes)).toBeCloseTo(24600 * (1 - 749000 / 1500000) - 10000, 6);
  });

  it('a deduction above the tax leaves every line at zero', () => {
    const taxes = lineTaxes([parcela('a', '2025-10-15', 750000), parcela('b', '2025-11-15', 750000)], 99999);
    expect(taxes).toEqual([0, 0]);
  });

  it('with part of the installments typed only their share comes off', () => {
    const taxes = lineTaxes([parcela('a', '2025-10-15', 750000)], 10000);
    expect(taxes[0]).toBeCloseTo(12300 - 5000, 6);
  });

  it('outside prazo it comes off the single line', () => {
    expect(buildSchedule(caso(base), 400000, 60000, 10000)[0].tax).toBe(50000);
    expect(buildSchedule(caso(base), 400000, 60000, 60000)).toEqual([]);
  });
});

describe('schedule outside an installment sale', () => {
  it('a cash sale is one line by the contract date', () => {
    const lines = buildSchedule(caso({...base, brokerage: 5000}), 400000, 60000);
    expect(lines).toEqual([
      {month: '2025-10', received: 1000000, gain: 400000, tax: 60000, dueDate: '2025-11-28'},
    ]);
  });

  it('no tax means no line, in a cash sale and in parts', () => {
    expect(buildSchedule(caso(base), 0, 0)).toEqual([]);
    expect(buildSchedule(caso(partes), 400000, 0)).toEqual([]);
  });

  it('calculateCase gives the cash sale its line', () => {
    const r = calculateCase(caso({...base, costItems: custo}));
    expect(r.schedule).toHaveLength(1);
    expect(r.schedule[0].tax).toBe(r.taxPayable);
    expect(r.schedule[0].gain).toBe(r.taxableBase);
  });

  it('a cash sale ignores installments left on the input', () => {
    const r = calculateCase(caso({...base, brokerage: 5000, installments: [parcela('a', '', -1)]}));
    expect(r.status).toBe('ok');
    expect(r.saleNet).toBe(995000);
    expect(r.schedule).toHaveLength(1);
    expect(modeAlerts(r)).toEqual([]);
  });

  it('an exempt cash sale has an empty schedule', () => {
    const single = {onlyProperty: true, noSaleIn5Years: true};
    const r = calculateCase(caso({...base, saleValue: 400000, singleProperty: single}));
    expect(r.taxPayable).toBe(0);
    expect(r.schedule).toEqual([]);
  });
});

describe('installment sale through calculateCase', () => {
  it('the case brokerage stays out of saleNet and grossGain', () => {
    const r = calculateCase(caso({...prazo, brokerage: 10000, costItems: custo, installments: [total]}));
    expect(r.status).toBe('ok');
    expect(r.saleNet).toBe(1000000);
    expect(r.grossGain).toBe(700000);
  });

  it('with the whole value received the lines add up to the table tax', () => {
    const r = calculateCase(
      caso({
        ...prazo,
        costItems: custo,
        installments: [parcela('a', '2025-10-15', 600000), parcela('b', '2025-12-15', 400000)],
      }),
    );
    expect(r.schedule).toHaveLength(2);
    expect(r.taxDue).toBeCloseTo(progressiveTax(r.taxableBase).total, 6);
    expect(r.schedule[0].gain).toBeCloseTo(r.taxableBase * 0.6, 6);
    expect(r.schedule[1].tax).toBeCloseTo(r.taxDue * 0.4, 6);
    expect(r.taxPayable).toBeCloseTo(r.taxDue, 6);
    expect(modeAlerts(r)).toEqual([]);
  });

  it('taxPayable is the sum of the lines, net of installment brokerage', () => {
    const installments = [parcela('a', '2025-10-15', 1000000, 10000)];
    const r = calculateCase(caso({...prazo, costItems: custo, installments}));
    expect(r.schedule[0].received).toBe(1000000);
    expect(r.taxPayable).toBeCloseTo(r.taxDue * 0.99, 6);
    expect(r.taxPayable).toBe(r.schedule[0].tax);
  });

  it('an exempt sale keeps its lines with no tax', () => {
    const single = {onlyProperty: true, noSaleIn5Years: true};
    const r = calculateCase(
      caso({...prazo, saleValue: 400000, singleProperty: single, installments: [parcela('a', '2025-10-15', 400000)]}),
    );
    expect(r.status).toBe('ok');
    expect(r.taxableBase).toBe(0);
    expect(r.schedule).toHaveLength(1);
    expect(r.schedule[0].tax).toBe(0);
    expect(r.taxPayable).toBe(0);
  });

  it('a negative gain keeps its lines with no tax', () => {
    const costItems = [item('compra', '2015-03-10', 1500000)];
    const r = calculateCase(caso({...prazo, costItems, installments: [total]}));
    expect(r.grossGain).toBe(-500000);
    expect(r.schedule[0].gain).toBe(0);
    expect(r.taxPayable).toBe(0);
  });

  it('art. 39 divides by the sale net of the installment brokerage', () => {
    const reinvestment = {
      ...defaultCaseInput().reinvestment,
      enabled: true,
      applications: [{id: 'a', date: '2025-11-10', value: 495000, kind: 'aquisicao' as const}],
    };
    const installments = [parcela('a', '2025-10-15', 1000000, 10000)];
    const r = calculateCase(caso({...prazo, costItems: custo, installments, reinvestment}));
    expect(r.saleNet).toBe(1000000);
    expect(r.reinvestment.proceeds).toBe(990000);
    expect(r.reinvestment.taxedShare).toBeCloseTo(0.5, 10);
  });
});

describe('alerts of an installment sale', () => {
  it('review focus 3: installments of 900,000 over 1,000,000 alert the difference', () => {
    const r = calculateCase(
      caso({
        ...prazo,
        costItems: custo,
        installments: [parcela('a', '2025-10-15', 400000), parcela('b', '2025-11-15', 500000)],
      }),
    );
    expect(r.status).toBe('ok');
    const alerts = modeAlerts(r);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].id).toBe('parcelas-diferenca');
    expect(alerts[0].level).toBe('aviso');
    expect(alerts[0].text).toContain(formatCurrency(100000));
    expect(r.schedule.reduce((sum, line) => sum + line.received, 0)).toBe(900000);
    expect(r.taxPayable).toBeCloseTo(r.taxDue * 0.9, 6);
  });

  it('a difference of rounding size gives no alert', () => {
    const installments = [parcela('a', '2025-10-15', 999999.996)];
    expect(modeAlerts(calculateCase(caso({...prazo, installments})))).toEqual([]);
  });

  it('a sum above the holder share by up to 0.005 is accepted', () => {
    const installments = [parcela('a', '2025-10-15', 1000000.004)];
    const r = calculateCase(caso({...prazo, installments}));
    expect(r.status).toBe('ok');
    expect(modeAlerts(r)).toEqual([]);
  });

  it('a sum above the holder share by more than 0.005 is invalid', () => {
    const installments = [parcela('a', '2025-10-15', 1000000.01)];
    expect(calculateCase(caso({...prazo, installments})).status).toBe('invalido');
  });

  it('the sum compares the holder share in a condominium', () => {
    const condo = {...prazo, saleValue: 2000000, ownership: 'condominio' as const, quotaPct: 50};
    expect(modeAlerts(calculateCase(caso({...condo, installments: [total]})))).toEqual([]);
    const above = [parcela('a', '2025-10-15', 1500000)];
    expect(calculateCase(caso({...condo, installments: above})).status).toBe('invalido');
  });

  it('gain above 5,000,000 is an open point and the tax still comes from the table', () => {
    const r = calculateCase(
      caso({
        ...prazo,
        acquisitionDate: '2025-09-10',
        saleValue: 20000000,
        installments: [parcela('a', '2025-10-15', 8000000), parcela('b', '2025-11-15', 12000000)],
      }),
    );
    expect(r.taxableBase).toBeGreaterThan(5000000);
    expect(r.brackets.length).toBeGreaterThan(1);
    expect(r.taxDue).toBeCloseTo(progressiveTax(r.taxableBase).total, 4);
    expect(r.schedule[0].tax).toBeCloseTo(r.taxDue * 0.4, 4);
    expect(r.schedule[1].tax).toBeCloseTo(r.taxDue * 0.6, 4);
    expect(r.taxPayable).toBeCloseTo(r.taxDue, 4);
    expect(modeAlerts(r).map((alert) => [alert.id, alert.level])).toEqual([['prazo-progressiva', 'aberto']]);
  });

  it('the open point starts above the first bracket limit', () => {
    const input = caso({...prazo, installments: [total]});
    expect(saleModeAlerts(input, 5000000)).toEqual([]);
    expect(saleModeAlerts(input, 5000000.01).map((alert) => alert.id)).toEqual(['prazo-progressiva']);
  });

  it('the open point is only for an installment sale', () => {
    expect(saleModeAlerts(caso(base), 7000000)).toEqual([]);
    expect(saleModeAlerts(caso(partes), 7000000)).toEqual([]);
  });
});

describe('validation of installments', () => {
  it('no installments is incomplete', () => {
    const r = calculateCase(caso(prazo));
    expect(r.status).toBe('incompleto');
    expect(r.missing).toEqual(['Parcelas']);
  });

  it('an installment without date or value is incomplete', () => {
    const noDate = calculateCase(caso({...prazo, installments: [parcela('a', '', 1000)]}));
    expect(noDate.status).toBe('incompleto');
    expect(noDate.missing).toEqual(['Data da parcela']);
    const zero = calculateCase(caso({...prazo, installments: [parcela('a', '2025-10-15', 0)]}));
    expect(zero.status).toBe('incompleto');
    expect(zero.missing).toEqual(['Valor da parcela']);
  });

  it('bad installments are invalid', () => {
    const bad = [
      parcela('a', '2025-02-30', 1000),
      parcela('a', '2025-10-15', -1),
      parcela('a', '2025-10-15', NaN),
      parcela('a', '2025-10-15', 1000, -1),
      parcela('a', '2025-10-15', 1000, NaN),
      parcela('a', '2025-10-15', 1000, 1000.01),
    ];
    for (const installment of bad) {
      expect(calculateCase(caso({...prazo, installments: [installment]})).status).toBe('invalido');
    }
  });

  it('an installment before the contract is invalid, and on the contract date is accepted', () => {
    const before = [parcela('a', '2025-10-09', 1000)];
    const same = [parcela('a', '2025-10-10', 1000)];
    expect(calculateCase(caso({...prazo, installments: before})).status).toBe('invalido');
    expect(calculateCase(caso({...prazo, installments: same})).status).toBe('ok');
  });
});

describe('sale in parts', () => {
  it('case 9: second part in the next year sums gains and deducts the tax paid', () => {
    const input = caso({...partes, priorParts: [parte('a', '2024-06-10', 4000000, 600000)]});
    expect(applyPriorParts(input, 3000000)).toEqual({
      totalGain: 7000000,
      tax: 1100000,
      priorTaxPaid: 600000,
      payable: 500000,
    });
  });

  it('case 10: second part two calendar years later has its own tax', () => {
    const input = caso({...partes, priorParts: [parte('a', '2023-06-10', 4000000, 600000)]});
    expect(applyPriorParts(input, 3000000)).toEqual({
      totalGain: 3000000,
      tax: 450000,
      priorTaxPaid: 0,
      payable: 450000,
    });
  });

  it('the deadline is the end of the calendar year after the first operation', () => {
    const priorParts = [parte('a', '2025-01-01', 4000000, 600000)];
    const last = applyPriorParts(caso({...partes, contractDate: '2026-12-31', priorParts}), 3000000);
    const late = applyPriorParts(caso({...partes, contractDate: '2027-01-01', priorParts}), 3000000);
    expect(last.totalGain).toBe(7000000);
    expect(late.totalGain).toBe(3000000);
  });

  it('the first operation is the earliest part, not the first typed', () => {
    const input = caso({
      ...partes,
      priorParts: [parte('b', '2024-06-10', 1000000, 150000), parte('a', '2023-06-10', 2000000, 300000)],
    });
    expect(applyPriorParts(input, 3000000).payable).toBe(450000);
  });

  it('all parts in the window are summed', () => {
    const input = caso({
      ...partes,
      priorParts: [parte('a', '2024-06-10', 3000000, 450000), parte('b', '2025-02-10', 1000000, 150000)],
    });
    expect(applyPriorParts(input, 3000000)).toEqual({
      totalGain: 7000000,
      tax: 1100000,
      priorTaxPaid: 600000,
      payable: 500000,
    });
  });

  it('tax paid above the tax of the total leaves nothing to pay, and no schedule', () => {
    const priorParts = [parte('a', '2025-02-10', 1000000, 900000)];
    const r = calculateCase(caso({...partes, costItems: custo, priorParts}));
    expect(r.status).toBe('ok');
    expect(r.taxDue).toBeGreaterThan(0);
    expect(r.priorTaxPaid).toBe(900000);
    expect(r.taxPayable).toBe(0);
    expect(r.schedule).toEqual([]);
  });

  it('calculateCase applies the table to the total and shows it in the brackets', () => {
    const priorParts = [parte('a', '2024-06-10', 4900000, 735000)];
    const r = calculateCase(caso({...partes, costItems: custo, priorParts}));
    const totalGain = 4900000 + r.taxableBase;
    expect(r.status).toBe('ok');
    expect(r.brackets).toHaveLength(2);
    expect(r.brackets.reduce((sum, line) => sum + line.base, 0)).toBeCloseTo(totalGain, 6);
    expect(r.taxDue).toBeCloseTo(progressiveTax(totalGain).total, 6);
    expect(r.priorTaxPaid).toBe(735000);
    expect(r.taxPayable).toBeCloseTo(r.taxDue - 735000, 6);
    expect(r.schedule).toHaveLength(1);
    expect(r.schedule[0].month).toBe('2025-10');
    expect(r.schedule[0].gain).toBe(r.taxableBase);
    expect(r.schedule[0].tax).toBe(r.taxPayable);
  });

  it('out of the window calculateCase keeps the brackets of this sale alone', () => {
    const priorParts = [parte('a', '2023-06-10', 4900000, 735000)];
    const r = calculateCase(caso({...partes, costItems: custo, priorParts}));
    expect(r.brackets).toHaveLength(1);
    expect(r.brackets[0].base).toBe(r.taxableBase);
    expect(r.priorTaxPaid).toBe(0);
    expect(r.taxPayable).toBe(r.taxDue);
  });

  it('with no prior parts it behaves as the first operation', () => {
    const r = calculateCase(caso({...partes, brokerage: 5000, costItems: custo}));
    const cash = calculateCase(caso({...base, brokerage: 5000, costItems: custo}));
    expect(r).toEqual(cash);
  });

  it('other modes ignore prior parts left on the input', () => {
    const priorParts = [parte('a', '2025-02-10', 4000000, 600000)];
    const r = calculateCase(caso({...base, costItems: custo, priorParts}));
    expect(r.priorTaxPaid).toBe(0);
    expect(r.taxPayable).toBe(r.taxDue);
    expect(r.taxDue).toBeCloseTo(progressiveTax(r.taxableBase).total, 6);
  });

  it('an exempt part still settles the prior gains: base 0, tax on the priors, one line', () => {
    const r = calculateCase(
      caso({
        ...partes,
        saleValue: 30000,
        smallValue: {sameNatureMonthTotal: 30000, confirmed: true},
        priorParts: [parte('a', '2025-02-10', 1000000, 100000)],
      }),
    );
    expect(r.status).toBe('ok');
    expect(r.exemption.small.applies).toBe(true);
    expect(r.taxableBase).toBe(0);
    expect(r.taxDue).toBe(150000);
    expect(r.priorTaxPaid).toBe(100000);
    expect(r.taxPayable).toBe(50000);
    expect(r.schedule).toHaveLength(1);
    expect(r.schedule[0].gain).toBe(0);
    expect(r.schedule[0].tax).toBe(50000);
  });
});

describe('validation of prior parts', () => {
  it('a part without date is incomplete', () => {
    const r = calculateCase(caso({...partes, priorParts: [parte('a', '', 1000, 150)]}));
    expect(r.status).toBe('incompleto');
    expect(r.missing).toEqual(['Data da parte anterior']);
  });

  it('bad parts are invalid', () => {
    const bad = [
      parte('a', '2025-02-30', 1000, 150),
      parte('a', '2025-02-10', -1, 150),
      parte('a', '2025-02-10', 1000, -1),
      parte('a', '2025-02-10', NaN, 150),
      parte('a', '2025-02-10', 1000, NaN),
    ];
    for (const part of bad) {
      expect(calculateCase(caso({...partes, priorParts: [part]})).status).toBe('invalido');
    }
  });

  it('a part after the contract is invalid, and on the contract date is accepted', () => {
    const after = [parte('a', '2025-10-11', 1000, 150)];
    const same = [parte('a', '2025-10-10', 1000, 150)];
    expect(calculateCase(caso({...partes, priorParts: after})).status).toBe('invalido');
    expect(calculateCase(caso({...partes, priorParts: same})).status).toBe('ok');
  });

  it('a part before the acquisition is invalid, and on the acquisition date is accepted', () => {
    const before = [parte('a', '2015-03-09', 1000, 150)];
    const same = [parte('a', '2015-03-10', 1000, 150)];
    const r = calculateCase(caso({...partes, contractDate: '2016-01-10', priorParts: before}));
    expect(r.status).toBe('invalido');
    expect(r.missing[0]).toContain('anterior à aquisição');
    expect(calculateCase(caso({...partes, contractDate: '2016-01-10', priorParts: same})).status).toBe('ok');
  });
});

describe('prior parts outside the window', () => {
  const outside = 'partes-fora-do-prazo';

  it('informs that this operation is taxed on its own', () => {
    const alerts = saleModeAlerts(caso({...partes, priorParts: [parte('a', '2023-02-10', 100000, 15000)]}), 0);
    const alert = alerts.find((a) => a.id === outside);
    expect(alert?.level).toBe('info');
    expect(alert?.text).toBe(
      'Partes anteriores fora do prazo do art. 21, § 3º, da Lei 8.981: apuração própria desta operação.',
    );
    expect(alert?.legal).toContain('Lei 8.981/1995, art. 21, § 3º');
  });

  it('says nothing with parts inside the window, without parts or in another mode', () => {
    const ids = (input: CaseInput) => saleModeAlerts(input, 0).map((a) => a.id);
    expect(ids(caso({...partes, priorParts: [parte('a', '2024-02-10', 100000, 15000)]}))).not.toContain(outside);
    expect(ids(caso({...partes, priorParts: []}))).not.toContain(outside);
    expect(ids(caso({...base, priorParts: [parte('a', '2023-02-10', 100000, 15000)]}))).not.toContain(outside);
  });

  it('reaches the result through calculateCase', () => {
    const r = calculateCase(caso({...partes, costItems: custo, priorParts: [parte('a', '2023-02-10', 100000, 15000)]}));
    expect(r.status).toBe('ok');
    expect(r.alerts.map((a) => a.id)).toContain(outside);
    expect(r.priorTaxPaid).toBe(0);
  });
});
