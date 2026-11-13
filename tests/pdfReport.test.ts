import {afterEach, describe, expect, it, vi} from 'vitest';
import {ASPECTOS_GERAIS} from '../src/data/textos';
import {defaultCaseInput} from '../src/utils/capitalGain';
import {isAssetResponse, pendingFields, PENDING, propertyText, reportFileName} from '../src/utils/pdfReport';

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

describe('isAssetResponse', () => {
  const response = (ok: boolean, type: string | null) => ({ok, headers: {get: () => type}});

  it('accepts a font or an image', () => {
    expect(isAssetResponse(response(true, 'font/ttf'))).toBe(true);
    expect(isAssetResponse(response(true, 'image/png'))).toBe(true);
    expect(isAssetResponse(response(true, null))).toBe(true);
  });

  it('refuses the index.html served with 200 for a missing asset, and an error status', () => {
    expect(isAssetResponse(response(true, 'text/html; charset=utf-8'))).toBe(false);
    expect(isAssetResponse(response(true, 'Text/HTML'))).toBe(false);
    expect(isAssetResponse(response(false, 'font/ttf'))).toBe(false);
  });
});

describe('pending fields', () => {
  const item = (id: string, description: string) => ({id, description, date: '2015-03-10', value: 1000, hasDocument: true});

  it('a short property description and an item without description are pending', () => {
    const input = {...defaultCaseInput(), propertyDescription: 'Apt', costItems: [item('a', 'Compra'), item('b', '  ')]};
    expect(propertyText(input)).toBe(PENDING);
    expect(pendingFields(input)).toEqual(['Descrição do imóvel (mínimo de 5 caracteres)', 'Descrição do item de custo 2']);
  });

  it('a described case has none', () => {
    const input = {...defaultCaseInput(), propertyDescription: 'Apartamento 101', costItems: [item('a', 'Compra')]};
    expect(propertyText(input)).toBe('Apartamento 101');
    expect(pendingFields(input)).toEqual([]);
  });
});
