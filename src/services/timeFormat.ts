// 消息时间戳格式化工具。

/** 相对时间：刚刚 / N 分钟前 / 今天 HH:mm / 昨天 HH:mm / MM-DD HH:mm */
export function formatRelativeTime(ts: number, nowMs = Date.now()): string {
  const now = nowMs;
  const diff = now - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;

  const date = new Date(ts);
  const today = new Date(nowMs);
  const isToday = date.toDateString() === today.toDateString();
  const hhmm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  if (isToday) return hhmm;

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${hhmm}`;

  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${hhmm}`;
}

/** 绝对时间：YYYY-MM-DD HH:mm:ss */
export function formatAbsoluteTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
