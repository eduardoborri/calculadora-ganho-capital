import {describe, expect, it} from 'vitest';
import {DARF_CODE, TRANSFER_AT_MARKET_RATE} from '../src/constants';
import {buildAlerts} from '../src/utils/alerts';
import {calculateCase, defaultCaseInput} from '../src/utils/capitalGain';
import {formatCurrency, formatPercent} from '../src/utils/format';
import type {Alert, Application, CaseInput, CaseResult, CostItem, ValueUpdate} from '../src/types';

function caso(partial: Partial<CaseInput>): CaseInput {
  return {...defaultCaseInput(), ...base, ...partial};
}

function item(id: string, date: string, value: number, extra: Partial<CostItem> = {}): CostItem {
  return {id, description: id, date, value, hasDocument: true, ...extra};
}

function reinv(partial: Partial<CaseInput['reinvestment']> = {}): CaseInput['reinvestment'] {
  return {...defaultCaseInput().reinvestment, enabled: true, ...partial};
}

function app(kind: Application['kind']): Application {
  return {id: 'a', date: '2025-11-10', value: 100000, kind};
}

function upd(partial: Partial<ValueUpdate> = {}): ValueUpdate {
  return {
    law: '14973',
    date: '2024-12-10',
    caa: 500000,
    dta: 1000000,
    originalAcquisitionDate: '2015-03-10',
    migratedFrom14973: false,
    taxPaidSelic: 0,
    exceptionCausaMortisOuPartilha: false,
    ...partial,
  };
}

function run(partial: Partial<CaseInput>): CaseResult {
  return calculateCase(caso(partial));
}

function find(r: CaseResult, id: string): Alert | undefined {
  return r.alerts.find((alert) => alert.id === id);
}

function ids(r: CaseResult): string[] {
  return r.alerts.map((alert) => alert.id);
}

const base = {
  acquisitionDate: '2015-03-10',
  contractDate: '2025-10-10',
  saleValue: 1000000,
  costItems: [item('compra', '2015-03-10', 300000)],
};
const single = {onlyProperty: true, noSaleIn5Years: true};

describe('sale', () => {
  it('belowMarket gives the arbitramento risk', () => {
    const alert = find(run({belowMarket: true}), 'arbitramento');
    expect(alert?.level).toBe('risco');
    expect(alert?.legal).toContain('art. 20');
    expect(ids(run({}))).not.toContain('arbitramento');
  });

  it('a future contract gets the projective note, and today does not', () => {
    const input = caso({});
    const partial = {...calculateCase(input), alerts: []};
    const note = buildAlerts(input, partial, '2025-10-09').find((alert) => alert.id === 'operacao-futura');
    expect(note?.level).toBe('info');
    expect(note?.text).toContain('projetivo');
    expect(buildAlerts(input, partial, '2025-10-10').map((alert) => alert.id)).not.toContain('operacao-futura');
  });

  it('calculateCase uses the current date for the projective note', () => {
    expect(ids(run({contractDate: '2999-01-10'}))).toContain('operacao-futura');
    expect(ids(run({}))).not.toContain('operacao-futura');
  });

  it('buildAlerts keeps the alerts already on the partial', () => {
    const input = caso({});
    const held: Alert = {id: 'x', level: 'info', text: 'x', legal: 'x'};
    expect(buildAlerts(input, {...calculateCase(input), alerts: [held]})[0]).toEqual(held);
  });
});

describe('reinvestment', () => {
  it('enabled gives the 180 days risk with the date, and the irrevocable option', () => {
    const r = run({contractDate: '2026-01-01', reinvestment: reinv()});
    const days = find(r, 'reinvestimento-180-dias');
    expect(days?.level).toBe('risco');
    expect(days?.text).toContain('30/06/2026');
    expect(days?.text).toContain('180');
    expect(days?.text).toContain('juros e multa');
    expect(find(r, 'reinvestimento-irretratavel')?.level).toBe('aviso');
  });

  it('each flag gives its warning, with its citation', () => {
    const cases: [Partial<CaseInput['reinvestment']>, string, string][] = [
      [{usedInLast5Years: true}, 'reinvestimento-uso-5-anos', 'art. 39, § 5º'],
      [{landOrGarage: true}, 'reinvestimento-terreno-garagem', '§ 11, II e III'],
      [{applications: [app('quitacao')]}, 'reinvestimento-quitacao', 'Cosit 14/2025'],
      [{moreThanOneSale: true}, 'reinvestimento-mais-de-uma-venda', '§ 6º'],
    ];
    for (const [partial, id, legal] of cases) {
      const alert = find(run({reinvestment: reinv(partial)}), id);
      expect(alert?.level).toBe('aviso');
      expect(alert?.legal).toContain(legal);
    }
  });

  it('an acquisition application gives no settlement warning', () => {
    expect(ids(run({reinvestment: reinv({applications: [app('aquisicao')]})}))).not.toContain(
      'reinvestimento-quitacao',
    );
  });

  it('a non-residential property explains that the exemption does not apply', () => {
    const r = run({residential: false, reinvestment: reinv({applications: [app('aquisicao')]})});
    expect(find(r, 'reinvestimento-nao-residencial')?.level).toBe('aviso');
    expect(r.reinvestment.taxedShare).toBe(1);
  });

  it('flags left on a disabled block say nothing', () => {
    const off = reinv({
      enabled: false,
      usedInLast5Years: true,
      landOrGarage: true,
      moreThanOneSale: true,
      applications: [app('quitacao')],
    });
    const r = run({residential: false, reinvestment: off});
    expect(ids(r).filter((id) => id.startsWith('reinvestimento'))).toEqual([]);
  });
});

describe('cost', () => {
  it('an item without document speaks of a limitation of the analysis', () => {
    const r = run({costItems: [item('escritura', '2015-03-10', 300000, {hasDocument: false})]});
    const alert = find(r, 'documento-faltante');
    expect(alert?.level).toBe('aviso');
    expect(alert?.text).toContain('limitação da análise');
    expect(alert?.text).toContain('escritura');
  });

  it('documented items and blank rows raise nothing', () => {
    const blank = item('vazio', '', 0, {description: '', hasDocument: false});
    expect(ids(run({costItems: [...base.costItems, blank]}))).not.toContain('documento-faltante');
  });

  it('an item up to 1995 without original asks to confirm the value in reais', () => {
    const old = {acquisitionDate: '1990-05-10'};
    const r = run({...old, costItems: [item('antigo', '1995-12-31', 1000)]});
    const alert = find(r, 'custo-1995-confirmar');
    expect(alert?.level).toBe('aviso');
    expect(alert?.text).toContain('31/12/1995');
    expect(alert?.text).toContain('antigo');
  });

  it('it stays quiet for a later, manual or indexed item', () => {
    const old = {acquisitionDate: '1990-05-10'};
    const quiet = [
      item('novo', '1996-01-01', 1000),
      item('manual', '1995-12-31', 1000, {manual: true}),
      item('indexado', '1995-07-10', 0, {original: {amount: 1000, moeda: 'Reais'}}),
    ];
    for (const entry of quiet) {
      const r = run({...old, costItems: [entry]});
      expect(r.status).toBe('ok');
      expect(ids(r)).not.toContain('custo-1995-confirmar');
    }
  });

  describe('CAA line dated up to 1995', () => {
    const old = {acquisitionDate: '1995-12-31', costItems: []};
    const original = {originalAcquisitionDate: '1995-12-31'};

    it('Lei 14.973 asks to confirm the value', () => {
      const r = run({...old, update: upd(original)});
      expect(r.status).toBe('ok');
      expect(find(r, 'custo-1995-confirmar')?.level).toBe('aviso');
    });

    it('a Rearp reversal asks as well', () => {
      const update = upd({...original, law: 'rearp', date: '2025-06-10', taxPaidSelic: 1000});
      expect(ids(run({...old, update}))).toContain('custo-1995-confirmar');
    });

    it('a Rearp that stands has its cost at the option date, and says nothing', () => {
      const update = upd({...original, law: 'rearp', date: '2019-06-10'});
      const r = run({...old, update});
      expect(r.status).toBe('ok');
      expect(ids(r)).not.toContain('custo-1995-confirmar');
    });

    it('a CAA of 1996 or of zero says nothing', () => {
      const later = upd({originalAcquisitionDate: '1996-01-01'});
      expect(ids(run({acquisitionDate: '1996-01-01', update: later}))).not.toContain('custo-1995-confirmar');
      expect(ids(run({...old, update: upd({...original, caa: 0})}))).not.toContain('custo-1995-confirmar');
    });
  });

  it('inheritance at market value gives the rate and the Darf', () => {
    const r = run({acquisitionForm: 'heranca', transferAtMarket: true});
    const alert = find(r, 'transferencia-mercado');
    expect(alert?.level).toBe('aviso');
    expect(alert?.text).toContain(formatPercent(TRANSFER_AT_MARKET_RATE));
    expect(alert?.text).toContain('Darf');
    expect(alert?.legal).toContain('Lei 9.532/1997, art. 23, §§ 1º e 5º');
  });

  it('dissolution at market value gets the same alert', () => {
    const r = run({acquisitionForm: 'dissolucao', transferAtMarket: true});
    expect(find(r, 'transferencia-mercado')?.level).toBe('aviso');
  });

  it('a flag left on a purchase says nothing', () => {
    expect(ids(run({transferAtMarket: true}))).not.toContain('transferencia-mercado');
    expect(ids(run({acquisitionForm: 'heranca'}))).not.toContain('transferencia-mercado');
  });

  it('marital community informs the payment in the name of each spouse', () => {
    const alert = find(run({ownership: 'comunhao'}), 'comunhao-recolhimento');
    expect(alert?.level).toBe('info');
    expect(alert?.text).toContain('cônjuge');
    expect(ids(run({}))).not.toContain('comunhao-recolhimento');
  });
});

describe('sale modes', () => {
  const prazo = {
    saleMode: 'prazo' as const,
    installments: [{id: 'a', date: '2025-10-15', value: 1000000, brokerage: 0}],
  };

  it('prazo informs interest and correction', () => {
    const alert = find(run(prazo), 'prazo-juros-correcao');
    expect(alert?.level).toBe('info');
    expect(alert?.text).toContain('carnê-leão');
    expect(alert?.legal).toContain('art. 19, § 3º');
    expect(ids(run({}))).not.toContain('prazo-juros-correcao');
  });

  it('prazo warns that the case brokerage is ignored', () => {
    const alert = find(run({...prazo, brokerage: 5000}), 'prazo-corretagem-ignorada');
    expect(alert?.level).toBe('aviso');
    expect(alert?.text).toContain(formatCurrency(5000));
    expect(ids(run(prazo))).not.toContain('prazo-corretagem-ignorada');
    expect(ids(run({brokerage: 5000}))).not.toContain('prazo-corretagem-ignorada');
  });

  it('installment brokerage is an open point with its citation', () => {
    const withBrokerage = {...prazo, installments: [{id: 'a', date: '2025-10-15', value: 1000000, brokerage: 30000}]};
    const alert = find(run(withBrokerage), 'prazo-corretagem-proporcao');
    expect(alert?.level).toBe('aberto');
    expect(alert?.text).toBe(
      'Na venda a prazo, o ganho é apurado sobre o valor total e a corretagem é deduzida da parcela do mês em que foi paga (IN SRF 84/2001, art. 19, § 4º). O efeito sobre a proporção do ganho por parcela é ponto em aberto.',
    );
    expect(alert?.legal).toBe('IN SRF 84/2001, art. 19, § 4º');
    expect(ids(run(prazo))).not.toContain('prazo-corretagem-proporcao');
    expect(ids(run({brokerage: 30000}))).not.toContain('prazo-corretagem-proporcao');
  });

  it('the alerts of the sale modes are merged', () => {
    const r = run({...prazo, installments: [{id: 'a', date: '2025-10-15', value: 900000, brokerage: 0}]});
    expect(find(r, 'parcelas-diferenca')?.legal).toBeTruthy();
  });

  describe('prior shortfall in parts', () => {
    const part = (date: string, taxPaid: number) => [{id: 'a', date, gain: 1000000, taxPaid}];
    const partes = {saleMode: 'partes' as const};

    it('tax paid below the table on the prior gains alerts the difference', () => {
      const r = run({...partes, priorParts: part('2025-02-10', 100000)});
      const alert = find(r, 'partes-diferenca-anterior');
      expect(alert?.level).toBe('aviso');
      expect(alert?.text).toContain(formatCurrency(50000));
      expect(alert?.text).toContain('juros e multa');
    });

    it('tax paid in full says nothing', () => {
      expect(ids(run({...partes, priorParts: part('2025-02-10', 150000)}))).not.toContain(
        'partes-diferenca-anterior',
      );
    });

    it('parts out of the window or left on another mode say nothing', () => {
      expect(ids(run({...partes, priorParts: part('2023-02-10', 100000)}))).not.toContain(
        'partes-diferenca-anterior',
      );
      expect(ids(run({priorParts: part('2025-02-10', 100000)}))).not.toContain('partes-diferenca-anterior');
    });
  });
});

describe('calendar year', () => {
  it('a typed year other than the contract year is informed', () => {
    const alert = find(run({calendarYear: 2026}), 'ano-calendario-divergente');
    expect(alert?.level).toBe('info');
    expect(alert?.text).toContain('(2026)');
    expect(alert?.text).toContain('(2025)');
    expect(alert?.legal.trim()).not.toBe('');
  });

  it('the contract year or no typed year says nothing', () => {
    expect(ids(run({calendarYear: 2025}))).not.toContain('ano-calendario-divergente');
    expect(ids(run({calendarYear: 0}))).not.toContain('ano-calendario-divergente');
  });
});

describe('value update', () => {
  it('a sale in parts warns about the amounts of the part and a repeated deduction', () => {
    const alert = find(run({saleMode: 'partes', update: upd()}), 'atualizacao-partes');
    expect(alert?.level).toBe('aviso');
    expect(alert?.text).toContain('parte vendida');
    expect(alert?.text).toContain('parte anterior');
    expect(ids(run({update: upd()}))).not.toContain('atualizacao-partes');
  });

  it('tax paid outside a reversal is reported as not used', () => {
    const r = run({update: upd({taxPaidSelic: 1000})});
    expect(find(r, 'atualizacao-selic-nao-usado')?.level).toBe('info');
    expect(r.priorTaxPaid).toBe(0);
    expect(ids(run({update: upd()}))).not.toContain('atualizacao-selic-nao-usado');
  });

  it('tax paid in a reversal is used and raises no such note', () => {
    const update = upd({law: 'rearp', date: '2025-06-10', taxPaidSelic: 1000});
    expect(ids(run({update}))).not.toContain('atualizacao-selic-nao-usado');
  });
});

describe('open points', () => {
  it('m2 after Dec/2005 gets the seal, and Dec/2005 itself does not', () => {
    const at = (date: string) => run({acquisitionDate: date, costItems: [item('compra', date, 300000)]});
    expect(find(at('2006-01-01'), 'm2-apos-2005')?.level).toBe('aberto');
    expect(ids(at('2005-12-31'))).not.toContain('m2-apos-2005');
  });

  it('m2 seal needs a reduced gain', () => {
    expect(ids(run({saleValue: 200000}))).not.toContain('m2-apos-2005');
  });

  it('the Darf code shows with the seal when there is tax to pay', () => {
    const alert = find(run({}), 'darf-codigo');
    expect(alert?.level).toBe('aberto');
    expect(alert?.text).toContain(DARF_CODE);
    expect(ids(run({saleValue: 400000, singleProperty: single}))).not.toContain('darf-codigo');
  });

  it('prazo above the first bracket keeps its seal', () => {
    const r = run({
      saleMode: 'prazo',
      acquisitionDate: '2025-09-10',
      costItems: [],
      saleValue: 20000000,
      installments: [{id: 'a', date: '2025-10-15', value: 20000000, brokerage: 0}],
    });
    expect(find(r, 'prazo-progressiva')?.level).toBe('aberto');
  });
});

describe('every alert', () => {
  const crowded = run({
    ownership: 'comunhao',
    acquisitionForm: 'heranca',
    transferAtMarket: true,
    belowMarket: true,
    residential: false,
    brokerage: 5000,
    saleMode: 'prazo',
    installments: [{id: 'a', date: '2025-10-15', value: 900000, brokerage: 0}],
    costItems: [item('compra', '2015-03-10', 300000, {hasDocument: false})],
    reinvestment: reinv({
      usedInLast5Years: true,
      landOrGarage: true,
      moreThanOneSale: true,
      applications: [app('quitacao')],
    }),
  });

  it('has a citation and a unique id', () => {
    expect(crowded.status).toBe('ok');
    expect(crowded.alerts.length).toBeGreaterThan(10);
    for (const alert of crowded.alerts) expect(alert.legal.trim()).not.toBe('');
    expect(new Set(ids(crowded)).size).toBe(crowded.alerts.length);
  });

  it('has a citation and a unique id in the cases with an update', () => {
    const reversal = run({
      contractDate: '2026-03-10',
      landRule: true,
      saleMode: 'partes',
      update: upd({
        law: 'rearp',
        date: '2026-02-20',
        originalAcquisitionDate: '1994-05-10',
        migratedFrom14973: true,
        taxPaidSelic: 1000,
      }),
    });
    const law14973 = run({contractDate: '2029-02-10', update: upd({taxPaidSelic: 1000})});
    const exception = run({update: upd({law: 'rearp', date: '2025-06-10', exceptionCausaMortisOuPartilha: true})});
    const migrated = run({
      contractDate: '2031-06-10',
      update: upd({law: 'rearp', date: '2025-06-10', migratedFrom14973: true}),
    });

    const all = [reversal, law14973, exception, migrated];
    for (const r of all) {
      expect(r.status).toBe('ok');
      for (const alert of r.alerts) expect(alert.legal.trim()).not.toBe('');
      expect(new Set(ids(r)).size).toBe(r.alerts.length);
    }
    const seen = all.flatMap(ids);
    for (const id of [
      'rearp-reversao',
      'rearp-apos-prazo',
      'rearp-excecao',
      'rearp-data',
      'rearp-migracao',
      'lei14973-percentual',
      'lei14973-rateio',
      'atualizacao-itens-ignorados',
      'atualizacao-regra-terreno',
      'atualizacao-data-divergente',
      'atualizacao-partes',
      'atualizacao-selic-nao-usado',
      'custo-1995-confirmar',
    ]) {
      expect(seen).toContain(id);
    }
  });

  it('a blocked case has none', () => {
    expect(run({contractDate: ''}).alerts).toEqual([]);
  });
});
