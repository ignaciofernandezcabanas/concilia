import { describe, it, expect } from 'vitest';
import { formatAmount, formatDate, getMonthRange, getQuarterRange, getYearMonth } from '@/lib/format';

describe('formatAmount', () => {
  it('formatea positivos con símbolo €', () => {
    const result = formatAmount(1234.56);
    expect(result).toContain('€');
    expect(result[0]).not.toBe('(');
  });

  it('formatea negativos entre paréntesis', () => {
    const result = formatAmount(-1234.56);
    expect(result[0]).toBe('(');
    expect(result[result.length - 1]).toBe(')');
    expect(result).toContain('€');
  });

  it('formatea cero con 2 decimales', () => {
    expect(formatAmount(0)).toContain('0,00');
  });

  it('siempre usa 2 decimales', () => {
    expect(formatAmount(100)).toContain('100,00');
  });

  it('acepta moneda alternativa', () => {
    const result = formatAmount(100, 'USD');
    expect(result).toContain('USD');
    expect(result).not.toContain('€');
  });

  it('usa coma como separador decimal', () => {
    expect(formatAmount(99.99)).toContain('99,99');
  });
});

describe('formatDate', () => {
  it('formato short contiene día y año', () => {
    const result = formatDate(new Date(2026, 2, 15));
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2026/);
  });

  it('formato iso devuelve YYYY-MM-DD', () => {
    // Use noon to avoid timezone issues with toISOString
    expect(formatDate(new Date(2026, 2, 15, 12), 'iso')).toBe('2026-03-15');
  });

  it('formato long contiene nombre del mes en español', () => {
    const result = formatDate(new Date(2026, 2, 15), 'long');
    expect(result.toLowerCase()).toContain('marzo');
  });

  it('acepta string como input', () => {
    const result = formatDate('2026-06-15T12:00:00Z', 'iso');
    expect(result).toBe('2026-06-15');
  });
});

describe('getMonthRange', () => {
  it('rango de un mes tiene from < to', () => {
    const { from, to } = getMonthRange(new Date(2026, 2, 15));
    expect(new Date(from).getTime()).toBeLessThan(new Date(to).getTime());
  });

  it('todos los meses producen rangos válidos', () => {
    for (let m = 0; m < 12; m++) {
      const { from, to } = getMonthRange(new Date(2026, m, 15));
      expect(new Date(from).getTime()).toBeLessThan(new Date(to).getTime());
    }
  });
});

describe('getQuarterRange', () => {
  it('cada trimestre tiene from < to', () => {
    for (const m of [1, 4, 7, 10]) {
      const { from, to } = getQuarterRange(new Date(2026, m, 15));
      expect(new Date(from).getTime()).toBeLessThan(new Date(to).getTime());
    }
  });

  it('trimestres consecutivos no se solapan', () => {
    const q1 = getQuarterRange(new Date(2026, 1, 15));
    const q2 = getQuarterRange(new Date(2026, 4, 15));
    expect(new Date(q1.to).getTime()).toBeLessThanOrEqual(new Date(q2.from).getTime());
  });

  it('Q1 empieza antes que Q2', () => {
    const q1 = getQuarterRange(new Date(2026, 1, 15));
    const q2 = getQuarterRange(new Date(2026, 4, 15));
    expect(new Date(q1.from).getTime()).toBeLessThan(new Date(q2.from).getTime());
  });
});

describe('getYearMonth', () => {
  it('devuelve YYYY-MM con padding', () => {
    expect(getYearMonth(new Date(2026, 2, 15))).toBe('2026-03');
  });

  it('mes de un dígito con padding', () => {
    expect(getYearMonth(new Date(2026, 0, 1))).toBe('2026-01');
  });

  it('diciembre', () => {
    expect(getYearMonth(new Date(2026, 11, 31))).toBe('2026-12');
  });
});
