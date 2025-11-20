/**
 * 获取上海时区（UTC+8）的当前日期，格式：YYYY-MM-DD
 */
export function getShanghaiDateString(): string {
  const now = new Date();
  // 获取上海时区的时间（UTC+8）
  const shanghaiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  
  const year = shanghaiTime.getFullYear();
  const month = String(shanghaiTime.getMonth() + 1).padStart(2, '0');
  const day = String(shanghaiTime.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * 获取上海时区（UTC+8）的 ISO 时间戳
 */
export function getShanghaiISOString(): string {
  const now = new Date();
  // 获取上海时区的时间（UTC+8）
  const shanghaiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  
  // 转换为 ISO 格式，但保持上海时区的日期时间
  const year = shanghaiTime.getFullYear();
  const month = String(shanghaiTime.getMonth() + 1).padStart(2, '0');
  const day = String(shanghaiTime.getDate()).padStart(2, '0');
  const hours = String(shanghaiTime.getHours()).padStart(2, '0');
  const minutes = String(shanghaiTime.getMinutes()).padStart(2, '0');
  const seconds = String(shanghaiTime.getSeconds()).padStart(2, '0');
  const milliseconds = String(shanghaiTime.getMilliseconds()).padStart(3, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}+08:00`;
}

/**
 * 获取上海时区（UTC+8）的当前年份
 */
export function getShanghaiYear(): number {
  const now = new Date();
  const shanghaiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  return shanghaiTime.getFullYear();
}

