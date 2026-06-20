import { describe, expect, it } from 'vitest';
import { formatRelativeTime, formatAbsoluteTime } from './timeFormat';

describe('formatRelativeTime', () => {
  const referenceNow = new Date(2026, 5, 20, 16, 0, 0).getTime();

  it('不足 1 分钟 → 刚刚', () => {
    expect(formatRelativeTime(referenceNow - 10_000, referenceNow)).toBe('刚刚');
  });

  it('N 分钟前', () => {
    expect(formatRelativeTime(referenceNow - 3 * 60_000, referenceNow)).toBe('3 分钟前');
    expect(formatRelativeTime(referenceNow - 59 * 60_000, referenceNow)).toBe('59 分钟前');
  });

  it('今天 → HH:mm', () => {
    const today = new Date(2026, 5, 20, 14, 23);
    const result = formatRelativeTime(today.getTime(), referenceNow);
    expect(result).toBe('14:23');
  });

  it('昨天 → 昨天 HH:mm', () => {
    const yesterday = new Date(2026, 5, 19, 9, 5);
    const result = formatRelativeTime(yesterday.getTime(), referenceNow);
    expect(result).toBe('昨天 09:05');
  });

  it('更早 → MM-DD HH:mm', () => {
    const d = new Date(2026, 0, 15, 8, 30); // 2026-01-15
    const result = formatRelativeTime(d.getTime(), referenceNow);
    expect(result).toBe('01-15 08:30');
  });
});

describe('formatAbsoluteTime', () => {
  it('格式化为 YYYY-MM-DD HH:mm:ss', () => {
    const d = new Date(2026, 5, 20, 14, 23, 5); // 2026-06-20
    expect(formatAbsoluteTime(d.getTime())).toBe('2026-06-20 14:23:05');
  });
});
