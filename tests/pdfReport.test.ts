import {afterEach, describe, expect, it, vi} from 'vitest';
import {ASPECTOS_GERAIS} from '../src/data/textos';
import {reportFileName} from '../src/utils/pdfReport';

describe('reportFileName', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the slug of the name', () => {
    expect(reportFileName('João da Silva', 'pdf')).toBe('apuracao_ganho_capital_joao_da_silva.pdf');
  });

  it('keeps the extension asked for', () => {
    expect(reportFileName('João da Silva', 'xlsx')).toBe('apuracao_ganho_capital_joao_da_silva.xlsx');
  });

  it('uses the date of the day without a name', () => {
    vi.useFakeTimers();
    // 15:00 UTC is 12:00 in Brasília.
    vi.setSystemTime(new Date('2026-11-08T15:00:00Z'));
    expect(reportFileName('', 'pdf')).toBe('apuracao_ganho_capital_2026-11-08.pdf');
    expect(reportFileName('   ', 'pdf')).toBe('apuracao_ganho_capital_2026-11-08.pdf');
  });

  it('uses the date in Brasília, not in UTC', () => {
    vi.useFakeTimers();
    // 01:00 UTC on the 9th is still 22:00 on the 8th in Brasília.
    vi.setSystemTime(new Date('2026-11-09T01:00:00Z'));
    expect(reportFileName('', 'pdf')).toBe('apuracao_ganho_capital_2026-11-08.pdf');
  });
});

describe('ASPECTOS_GERAIS', () => {
  it('has the five approved paragraphs', () => {
    expect(ASPECTOS_GERAIS.length).toBe(5);
  });

  it('opens and closes with the approved text', () => {
    expect(ASPECTOS_GERAIS[0].startsWith('O ganho de capital na alienação de imóveis por pessoa física residente no Brasil')).toBe(true);
    expect(ASPECTOS_GERAIS[4].endsWith('a declaração nem a análise individual de cada caso.')).toBe(true);
  });
});
