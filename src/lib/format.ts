import { APP_TIMEZONE } from '@/lib/timezone';

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
    timeZone: APP_TIMEZONE,
  }).format(new Date(date));
}

export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeZone: APP_TIMEZONE,
  }).format(new Date(date));
}

// 梯次的預購期間；endAt 為 null 代表沒有設結束時間（長期開放）。
export function formatBatchPeriod(
  startAt: Date | string,
  endAt: Date | string | null,
) {
  if (!endAt) return `${formatDate(startAt)} 起，長期開放`;
  return `${formatDate(startAt)} - ${formatDate(endAt)}`;
}

// 把 ISBN/作者/出版社拼成一行小字——梯次頁面（管理書籍列表、逐本對帳表）
// 都要顯示這幾項，方便承辦人員跟出版社/書商對帳、下單時不用再跑去書籍
// 管理頁查一次。三項都沒填就回傳 null，呼叫端可以直接判斷要不要渲染。
export function formatBookRef(book: {
  isbn: string | null;
  author: string | null;
  publisher: string | null;
}) {
  const parts = [book.isbn, book.author, book.publisher].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}
