import { formatPence, parsePounds } from '../format';

describe('money', () => {
  it('formats pence as pounds', () => {
    expect(formatPence(500)).toBe('£5');
    expect(formatPence(550)).toBe('£5.50');
    expect(formatPence(5)).toBe('£0.05');
    expect(formatPence(null)).toBe('–');
  });

  it('parses what a captain types', () => {
    expect(parsePounds('5')).toBe(500);
    expect(parsePounds('£5.5')).toBe(550);
    expect(parsePounds(' 12.25 ')).toBe(1225);
    expect(parsePounds('')).toBeNull();
    expect(parsePounds('five')).toBeNaN();
    expect(parsePounds('5.555')).toBeNaN();
  });
});
