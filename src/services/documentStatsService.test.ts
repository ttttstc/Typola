import { describe, expect, it } from 'vitest';
import { calculateDocumentStats } from './documentStatsService';

describe('documentStatsService', () => {
  it('counts mixed Chinese and English writing', () => {
    const stats = calculateDocumentStats('# 标题\n\nHello world，这是正文。');
    expect(stats.words).toBeGreaterThanOrEqual(8);
    expect(stats.paragraphs).toBe(2);
    expect(stats.readingMinutes).toBe(1);
  });
});
