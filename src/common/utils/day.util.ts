/**
 * 「自然日」工具：统一按 Asia/Shanghai 计日（用户在国内，服务器可能是 UTC）。
 * 用于广场浏览去重、AI 每日额度等「次日 0 点重置」场景。
 */

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8，无夏令时

/** 当前上海日期，格式 YYYY-MM-DD（与 Work.dateKey 同形） */
export function todayKey(now: Date = new Date()): string {
  return new Date(now.getTime() + SHANGHAI_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

/** 距上海时区次日 0 点的秒数（Redis TTL 用；调用方自行加缓冲） */
export function secondsToNextMidnight(now: Date = new Date()): number {
  const shifted = now.getTime() + SHANGHAI_OFFSET_MS;
  const nextMidnightShifted =
    Math.floor(shifted / 86_400_000) * 86_400_000 + 86_400_000;
  return Math.ceil((nextMidnightShifted - shifted) / 1000);
}

/** 上海时区今日 0 点对应的 Date（DB 查询下边界用） */
export function todayStart(now: Date = new Date()): Date {
  const shifted = now.getTime() + SHANGHAI_OFFSET_MS;
  const midnightShifted = Math.floor(shifted / 86_400_000) * 86_400_000;
  return new Date(midnightShifted - SHANGHAI_OFFSET_MS);
}
