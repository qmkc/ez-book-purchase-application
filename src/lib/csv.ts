// 匯出 CSV 用的共用小工具。目前只有梯次訂單列表（購買人資料）在用，但跳脫
// 規則跟觸發下載都是通用邏輯，之後若其他列表也要加「匯出」不用重寫一次。

// 欄位值只要含逗號、雙引號或換行就要用雙引號包起來；包起來後把值裡原本的
// 雙引號都變成兩個雙引號跳脫——沿用 RFC 4180 的規則，Excel/Numbers/Google
// Sheets 都吃這套。
function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvField).join(',')).join('\r\n');
}

// UTF-8 BOM：Excel 開啟不含 BOM 的 UTF-8 CSV 常會誤判編碼，中文內容變成
// 亂碼；Numbers、Google Sheets 本來就認 UTF-8，不受 BOM 影響，加了無害。
const UTF8_BOM = '﻿';

// 觸發瀏覽器下載一個 CSV 檔案。用完即丟的 <a> 元素 + Blob URL 是瀏覽器
// 觸發下載的標準做法。
export function downloadCsv(filename: string, rows: string[][]) {
  const csv = UTF8_BOM + buildCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
