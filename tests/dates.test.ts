import {describe, expect, it} from 'vitest';
import {
  addDays,
  addYears,
  completedMonths,
  isNationalHoliday,
  lastBusinessDayOfNextMonth,
  monthsInclusive,
  reportYear,
} from '../src/utils/dates';

describe('addYears', () => {
  it('keeps day and month', () => {
    expect(addYears('2026-01-15', 5)).toBe('2031-01-15');
  });

  it('without the same day it falls on the next one', () => {
    expect(addYears('2024-02-29', 5)).toBe('2029-03-01');
  });
});

describe('monthsInclusive', () => {
  it('counts first and last month', () => {
    expect(monthsInclusive('1996-01-01', '2005-11-30')).toBe(119);
    expect(monthsInclusive('2005-12-01', '2025-10-10')).toBe(239);
  });
});

describe('completedMonths', () => {
  it('counts only full months', () => {
    expect(completedMonths('2022-01-15', '2025-01-15')).toBe(36);
    expect(completedMonths('2022-01-15', '2025-01-14')).toBe(35);
  });
});

describe('addDays', () => {
  it('adds days in UTC', () => {
    expect(addDays('2026-01-01', 180)).toBe('2026-06-30');
  });
});

describe('lastBusinessDayOfNextMonth', () => {
  it('skips weekends', () => {
    expect(lastBusinessDayOfNextMonth('2026-01-10')).toBe('2026-02-27');
  });
  it('keeps a weekday month end', () => {
    expect(lastBusinessDayOfNextMonth('2026-03-15')).toBe('2026-04-30');
  });
  it('rolls over the year', () => {
    expect(lastBusinessDayOfNextMonth('2026-12-10')).toBe('2027-01-29');
  });
});

describe('isNationalHoliday', () => {
  it('computes Good Friday from Easter', () => {
    expect(isNationalHoliday('2026-04-03')).toBe(true);
  });
  it('knows fixed holidays', () => {
    expect(isNationalHoliday('2026-11-20')).toBe(true);
  });
  it('does not treat Carnival as holiday', () => {
    expect(isNationalHoliday('2026-02-17')).toBe(false);
  });
});

describe('reportYear', () => {
  it('keeps a typed year', () => {
    expect(reportYear(2026, '2025-10-10')).toBe(2026);
  });

  it('falls back to the contract year when none was typed', () => {
    expect(reportYear(0, '2025-10-10')).toBe(2025);
  });

  it('stays 0 without a typed year or a valid contract date', () => {
    expect(reportYear(0, '')).toBe(0);
    expect(reportYear(0, '2025-02-30')).toBe(0);
  });
});
