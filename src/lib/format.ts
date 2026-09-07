// 新台幣金額格式化，統一小數點呈現方式（本專案金額欄位都是整數，不會有小數）。
export function formatTWD(amount: number) {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateTime(date: Date | string) {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date));
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
  }).format(new Date(date));
}

// 梯次的預購期間；endAt 為 null 代表沒有設結束時間（長期開放）。
export function formatBatchPeriod(startAt: Date | string, endAt: Date | string | null) {
  if (!endAt) return `${formatDate(startAt)} 起，長期開放`;
  return `${formatDate(startAt)} - ${formatDate(endAt)}`;
}
