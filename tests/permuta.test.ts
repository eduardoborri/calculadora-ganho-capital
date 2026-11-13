import {describe, expect, it} from 'vitest';
import {calculateCase, defaultCaseInput} from '../src/utils/capitalGain';
import {round2} from '../src/utils/format';
import {HISTORY_KEY, loadHistory, saveEntry} from '../src/utils/history';
import type {Alert, CaseInput, CaseResult, CostItem, Installment} from '../src/types';

function caso(partial: Partial<CaseInput>): CaseInput {
  return {...defaultCaseInput(), ...partial};
}

function find(r: CaseResult, id: string): Alert | undefined {
  return r.alerts.find((alert) => alert.id === id);
}

function parcela(id: string, date: string, value: number, brokerage = 0): Installment {
  return {id, date, value, brokerage};
}

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

// Perguntao IRPF 2026, question 632: declared cost of 60.000,00 dated 1990, torna of 10.000,00.
// The received property's value only matters for the small-value test; 60.000,00 is fictitious.
const declarado: CostItem = {
  id: 'dado',
  description: 'Apartamento dado em permuta',
  date: '1990-10-15',
  value: 60000,
  hasDocument: true,
  manual: true,
};

const oficial: Partial<CaseInput> = {
  acquisitionDate: '1990-10-15',
  contractDate: '2025-05-05',
  costItems: [declarado],
  operation: 'permuta',
  permuta: {torna: 10000, receivedValue: 60000},
};

describe('permuta com torna: exemplo oficial (pergunta 632)', () => {
  const r = calculateCase(caso(oficial));

  it('apura proporção, ganho, reduções, base e imposto', () => {
    expect(r.status).toBe('ok');
    expect(r.permuta).not.toBeNull();
    expect(r.permuta.proportion).toBeCloseTo(10000 / 70000, 6);
    expect(round2(r.permuta.proportion * 100)).toBe(14.29);
    expect(r.saleNet).toBe(10000);
    expect(round2(r.totalCost)).toBe(8571.43);
    expect(round2(r.grossGain)).toBe(1428.57);
    expect(round2(r.permuta.tornaGain)).toBe(1428.57);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].art18Pct).toBe(0);
    expect(r.items[0].m1).toBe(119);
    expect(r.items[0].m2).toBe(234);
    expect(r.items[0].fr1).toBeCloseTo(1 / 1.006 ** 119, 6);
    expect(r.items[0].fr2).toBeCloseTo(1 / 1.0035 ** 234, 6);
    expect(round2(r.gainAfterReductions)).toBe(309.51);
    expect(round2(r.taxableBase)).toBe(309.51);
    expect(round2(r.taxDue)).toBe(46.43);
    expect(round2(r.taxPayable)).toBe(46.43);
  });

  it('informa o custo do imóvel recebido', () => {
    expect(round2(r.permuta.receivedCost)).toBe(51428.57);
    const alert = find(r, 'permuta-custo-recebido');
    expect(alert?.level).toBe('info');
    expect(alert?.text).toContain('51.428,57');
    expect(alert?.legal).toContain('art. 128');
  });

  it('não traz alerta de permuta sem torna nem de corretagem', () => {
    expect(find(r, 'permuta-sem-torna')).toBeUndefined();
    expect(find(r, 'permuta-corretagem')).toBeUndefined();
  });

  it('a venda (padrão) não tem resultado de permuta', () => {
    const venda = calculateCase(caso({...oficial, operation: 'venda', saleValue: 70000}));
    expect(venda.status).toBe('ok');
    expect(venda.permuta).toBeNull();
    expect(round2(venda.grossGain)).toBe(10000);
    expect(defaultCaseInput().operation).toBe('venda');
    expect(defaultCaseInput().permuta).toEqual({torna: 0, receivedValue: 0});
  });

  it('o valor de alienação digitado é ignorado na permuta', () => {
    const outro = calculateCase(caso({...oficial, saleValue: 999999}));
    expect(outro.taxPayable).toBe(r.taxPayable);
  });
});

describe('permuta com torna a prazo', () => {
  it('reparte o imposto pelas parcelas da torna, somando o total', () => {
    const vista = calculateCase(caso(oficial));
    const r = calculateCase(
      caso({
        ...oficial,
        saleMode: 'prazo',
        installments: [parcela('a', '2025-05-20', 4000), parcela('b', '2025-08-20', 6000)],
      }),
    );
    expect(r.status).toBe('ok');
    expect(r.schedule).toHaveLength(2);
    expect(r.schedule[0].tax).toBeCloseTo(vista.taxDue * 0.4, 6);
    expect(r.schedule[1].tax).toBeCloseTo(vista.taxDue * 0.6, 6);
    expect(r.taxPayable).toBeCloseTo(vista.taxDue, 6);
    expect(round2(r.taxPayable)).toBe(46.43);
    expect(find(r, 'parcelas-diferenca')).toBeUndefined();
  });

  it('parcelas acima da torna são inválidas', () => {
    const r = calculateCase(caso({...oficial, saleMode: 'prazo', installments: [parcela('a', '2025-05-20', 12000)]}));
    expect(r.status).toBe('invalido');
    expect(r.missing.join(' ')).toContain('superam a torna (');
  });
});

describe('permuta: pequeno valor compara o valor total da operação (pergunta 681)', () => {
  const confirmado = {sameNatureMonthTotal: 0, confirmed: true};

  it('torna de 30.000 e imóvel recebido de 10.000 não se enquadram', () => {
    const r = calculateCase(caso({...oficial, permuta: {torna: 30000, receivedValue: 10000}, smallValue: confirmado}));
    expect(r.status).toBe('ok');
    expect(r.exemption.small.applies).toBe(false);
    expect(r.exemption.small.reasons.join(' ')).toContain('40.000,00');
    expect(r.taxPayable).toBeGreaterThan(0);
  });

  it('torna de 5.000 e imóvel recebido de 20.000 se enquadram', () => {
    const r = calculateCase(caso({...oficial, permuta: {torna: 5000, receivedValue: 20000}, smallValue: confirmado}));
    expect(r.status).toBe('ok');
    expect(r.exemption.small.applies).toBe(true);
    expect(r.grossGain).toBeGreaterThan(0);
    expect(r.taxableBase).toBe(0);
    expect(r.taxPayable).toBe(0);
  });
});

describe('permuta: único imóvel', () => {
  it('compara o valor total ao limite e abre o ponto', () => {
    const r = calculateCase(
      caso({
        ...oficial,
        permuta: {torna: 100000, receivedValue: 400000},
        singleProperty: {onlyProperty: true, noSaleIn5Years: true},
      }),
    );
    expect(r.status).toBe('ok');
    expect(r.exemption.single.applies).toBe(false);
    expect(r.exemption.single.reasons.join(' ')).toContain('500.000,00');
    expect(find(r, 'permuta-limite-unico-imovel')?.level).toBe('aberto');
  });

  it('total dentro do limite: isenção aplicada', () => {
    const r = calculateCase(
      caso({
        ...oficial,
        permuta: {torna: 100000, receivedValue: 300000},
        singleProperty: {onlyProperty: true, noSaleIn5Years: true},
      }),
    );
    expect(r.exemption.single.applies).toBe(true);
    expect(r.taxPayable).toBe(0);
  });
});

describe('permuta em condomínio', () => {
  it('quota de 50% mantém a proporção e dá metade do ganho', () => {
    const inteiro = calculateCase(caso(oficial));
    const r = calculateCase(caso({...oficial, ownership: 'condominio', quotaPct: 50}));
    expect(r.status).toBe('ok');
    expect(r.permuta.proportion).toBeCloseTo(inteiro.permuta.proportion, 9);
    expect(r.grossGain).toBeCloseTo(inteiro.grossGain / 2, 6);
    expect(r.gainAfterReductions).toBeCloseTo(inteiro.gainAfterReductions / 2, 6);
    expect(r.permuta.receivedCost).toBeCloseTo(inteiro.permuta.receivedCost / 2, 6);
    expect(round2(r.grossGain)).toBe(714.29);
  });
});

describe('permuta sem torna', () => {
  it('não há ganho nem imposto, com alerta', () => {
    const r = calculateCase(caso({...oficial, permuta: {torna: 0, receivedValue: 60000}}));
    expect(r.status).toBe('ok');
    expect(r.grossGain).toBe(0);
    expect(r.items).toEqual([]);
    expect(r.taxableBase).toBe(0);
    expect(r.taxDue).toBe(0);
    expect(r.taxPayable).toBe(0);
    expect(r.schedule).toEqual([]);
    expect(r.permuta).toEqual({proportion: 0, tornaGain: 0, receivedCost: 60000});
    const alert = find(r, 'permuta-sem-torna');
    expect(alert?.level).toBe('info');
    expect(alert?.legal).toBe('RIR/2018, art. 132, II');
  });

  const semTorna = {...oficial, permuta: {torna: 0, receivedValue: 60000}};

  it('com corretagem: ok, sem imposto, corretagem não deduzida', () => {
    const r = calculateCase(caso({...semTorna, brokerage: 100}));
    expect(r.status).toBe('ok');
    expect(r.saleNet).toBe(0);
    expect(r.grossGain).toBe(0);
    expect(r.taxPayable).toBe(0);
    expect(r.permuta.receivedCost).toBe(60000);
    const text = find(r, 'permuta-sem-torna')?.text ?? '';
    expect(text).toContain('100,00');
    expect(text).toContain('não foi deduzida');
    expect(find(r, 'permuta-corretagem')).toBeUndefined();
  });

  it('a prazo sem parcelas: ok, como à vista', () => {
    const r = calculateCase(caso({...semTorna, saleMode: 'prazo', installments: []}));
    expect(r.status).toBe('ok');
    expect(r.taxPayable).toBe(0);
    expect(r.schedule).toEqual([]);
  });

  it('a prazo com parcelas e corretagem: ok, sem imposto, alerta cita a corretagem', () => {
    const r = calculateCase(
      caso({...semTorna, saleMode: 'prazo', installments: [parcela('a', '2025-05-20', 5000, 200)]}),
    );
    expect(r.status).toBe('ok');
    expect(r.taxPayable).toBe(0);
    expect(r.schedule).toEqual([]);
    expect(find(r, 'permuta-sem-torna')?.text).toContain('200,00');
  });

  it('em partes com parte anterior tributável: ok, sem imposto', () => {
    const r = calculateCase(
      caso({...semTorna, saleMode: 'partes', priorParts: [{id: 'p', date: '2025-01-10', gain: 100000, taxPaid: 0}]}),
    );
    expect(r.status).toBe('ok');
    expect(r.taxDue).toBe(0);
    expect(r.taxPayable).toBe(0);
  });
});

describe('permuta: validação', () => {
  it('sem valor do imóvel recebido fica incompleto', () => {
    const r = calculateCase(caso({...oficial, permuta: {torna: 10000, receivedValue: 0}}));
    expect(r.status).toBe('incompleto');
    expect(r.missing).toContain('Valor do imóvel recebido');
    expect(r.missing).not.toContain('Valor de alienação');
  });

  it.each([
    ['torna negativa', {torna: -1, receivedValue: 60000}],
    ['torna acima do teto', {torna: 2e15, receivedValue: 60000}],
    ['imóvel recebido negativo', {torna: 10000, receivedValue: -5}],
    ['torna NaN', {torna: Number.NaN, receivedValue: 60000}],
  ])('%s é inválido', (_nome, permuta) => {
    expect(calculateCase(caso({...oficial, permuta})).status).toBe('invalido');
  });
});

describe('permuta com corretagem', () => {
  it('deduz a corretagem da torna e abre o ponto', () => {
    const r = calculateCase(caso({...oficial, brokerage: 500}));
    expect(r.status).toBe('ok');
    expect(r.saleNet).toBe(9500);
    expect(r.permuta.proportion).toBeCloseTo(10000 / 70000, 9);
    expect(round2(r.grossGain)).toBe(928.57);
    expect(r.reinvestment.proceeds).toBe(9500);
    expect(round2(r.permuta.receivedCost)).toBe(51428.57);
    const alert = find(r, 'permuta-corretagem');
    expect(alert?.level).toBe('aberto');
    expect(alert?.text).not.toContain('o ganho fica em zero');
  });

  it('o custo do imóvel recebido é o mesmo à vista e a prazo', () => {
    const vista = calculateCase(caso({...oficial, brokerage: 500}));
    const prazo = calculateCase(
      caso({
        ...oficial,
        saleMode: 'prazo',
        installments: [parcela('a', '2025-05-20', 4000, 200), parcela('b', '2025-08-20', 6000, 300)],
      }),
    );
    expect(prazo.status).toBe('ok');
    expect(prazo.permuta.receivedCost).toBe(vista.permuta.receivedCost);
    expect(round2(prazo.permuta.receivedCost)).toBe(51428.57);
    expect(find(prazo, 'permuta-corretagem')?.level).toBe('aberto');
  });

  it.each([
    ['acima do ganho da torna', 2000],
    ['acima da torna', 10001],
  ])('corretagem %s: ganho zero, sem imposto, com alerta', (_nome, brokerage) => {
    const r = calculateCase(caso({...oficial, brokerage}));
    expect(r.status).toBe('ok');
    expect(r.saleNet).toBe(10000 - brokerage);
    expect(r.grossGain).toBe(0);
    expect(r.items).toEqual([]);
    expect(r.taxableBase).toBe(0);
    expect(r.taxPayable).toBe(0);
    expect(r.permuta.tornaGain).toBe(0);
    expect(round2(r.permuta.receivedCost)).toBe(51428.57);
    expect(find(r, 'permuta-corretagem')?.text).toContain('o ganho fica em zero');
  });
});

describe('permuta no histórico', () => {
  it('guarda operation e permuta na ida e volta', () => {
    const s = fakeStorage();
    const input = caso({...oficial, permuta: {torna: 12345, receivedValue: 67890}});
    saveEntry(input, s);
    const [entry] = loadHistory(s);
    expect(entry.input.operation).toBe('permuta');
    expect(entry.input.permuta).toEqual({torna: 12345, receivedValue: 67890});
  });

  it('entrada antiga: "permuta_torna" sai do fora de escopo e a operação vira permuta', () => {
    const raw = JSON.stringify([
      {id: 'old', savedAt: '2026-01-01T00:00:00.000Z', input: {saleValue: 1, outOfScope: ['permuta_torna', 'exterior']}},
    ]);
    const [entry] = loadHistory(fakeStorage({[HISTORY_KEY]: raw}));
    expect(entry.input.outOfScope).toEqual(['exterior']);
    expect(entry.input.operation).toBe('permuta');
    expect(entry.input.permuta).toEqual({torna: 0, receivedValue: 0});
  });

  it('entrada antiga com "permuta_torna" e sem operação volta como permuta incompleta, nunca como venda', () => {
    const old = {
      saleValue: 500000,
      acquisitionDate: '2015-01-10',
      contractDate: '2025-05-05',
      costItems: [{id: 'c', description: 'Compra', date: '2015-01-10', value: 300000, hasDocument: true}],
      outOfScope: ['permuta_torna'],
    };
    const raw = JSON.stringify([{id: 'old', savedAt: '2026-01-01T00:00:00.000Z', input: old}]);
    const [entry] = loadHistory(fakeStorage({[HISTORY_KEY]: raw}));
    expect(entry.input.operation).toBe('permuta');
    expect(entry.input.outOfScope).toEqual([]);
    const r = calculateCase(entry.input);
    expect(r.status).not.toBe('ok');
    expect(r.status).toBe('incompleto');
    expect(r.missing).toContain('Valor do imóvel recebido');
    // The same input as a sale would be ok and taxed: the legacy flag must not lead there.
    expect(calculateCase({...entry.input, operation: 'venda'}).status).toBe('ok');
  });

  it('operação gravada prevalece sobre "permuta_torna" antigo', () => {
    const raw = JSON.stringify([{id: 'x', input: {operation: 'venda', outOfScope: ['permuta_torna']}}]);
    const [entry] = loadHistory(fakeStorage({[HISTORY_KEY]: raw}));
    expect(entry.input.operation).toBe('venda');
  });

  it('valores corrompidos voltam aos padrões', () => {
    const raw = JSON.stringify([
      {id: 'bad', input: {operation: 'troca', permuta: {torna: 'x', receivedValue: null}}},
      {id: 'bad2', input: {operation: 'permuta', permuta: 7}},
    ]);
    const [a, b] = loadHistory(fakeStorage({[HISTORY_KEY]: raw}));
    expect(a.input.operation).toBe('venda');
    expect(a.input.permuta).toEqual({torna: 0, receivedValue: 0});
    expect(b.input.operation).toBe('permuta');
    expect(b.input.permuta).toEqual({torna: 0, receivedValue: 0});
    expect(() => calculateCase(b.input)).not.toThrow();
  });
});
