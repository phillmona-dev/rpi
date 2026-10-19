import { describe, expect, it } from 'vitest';
import { money, pct, signedPp, localizedName, fmtDate } from './format';

describe('format', () => {
  it('compacts ETB amounts', () => {
    expect(money(14_536_000_000)).toBe('ETB 14.54 B');
    expect(fmtDate('2028-01-01', 'en', 'short')).toBe('1 Jan 28');
    expect(money(5_678_700_000)).toBe('ETB 5.68 B');
    expect(money(86_000_000)).toBe('ETB 86 M');
    expect(money(12_500)).toBe('ETB 13 K');
    expect(money(null)).toBe('—');
  });
  it('formats percentages and variance', () => {
    expect(pct(49.2)).toBe('49%');
    expect(pct(49.26, 1)).toBe('49.3%');
    expect(signedPp(-9.5)).toBe('-10 pp');
    expect(signedPp(3.2, 1)).toBe('+3.2 pp');
  });
  it('resolves localized names with fallback', () => {
    const n = { en: 'Adwa', ti: 'ዓድዋ', am: null };
    expect(localizedName(n, 'ti')).toBe('ዓድዋ');
    expect(localizedName(n, 'am')).toBe('Adwa');
    expect(localizedName(n, 'en')).toBe('Adwa');
  });
});
