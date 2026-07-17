import { secondsToNextMidnight, todayKey, todayStart } from './day.util';

describe('day.util（Asia/Shanghai 自然日）', () => {
  it('UTC 16:00 之后即上海次日：todayKey 按上海日期', () => {
    // 2026-07-16 16:30 UTC = 2026-07-17 00:30 上海
    expect(todayKey(new Date('2026-07-16T16:30:00.000Z'))).toBe('2026-07-17');
    // 2026-07-16 15:59 UTC = 2026-07-16 23:59 上海
    expect(todayKey(new Date('2026-07-16T15:59:00.000Z'))).toBe('2026-07-16');
  });

  it('secondsToNextMidnight：到上海次日 0 点的秒数', () => {
    // 上海 00:30 → 距午夜 23.5h = 84600s
    expect(secondsToNextMidnight(new Date('2026-07-16T16:30:00.000Z'))).toBe(
      84600,
    );
    // 上海 00:00 整 → 86400s
    expect(secondsToNextMidnight(new Date('2026-07-16T16:00:00.000Z'))).toBe(
      86400,
    );
  });

  it('todayStart：上海今日 0 点对应的 UTC Date', () => {
    // 上海 2026-07-17 00:30 → 今日 0 点 = 2026-07-16 16:00 UTC
    expect(todayStart(new Date('2026-07-16T16:30:00.000Z')).toISOString()).toBe(
      '2026-07-16T16:00:00.000Z',
    );
  });
});
