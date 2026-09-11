// drizzle-orm 0.45+ 的查詢錯誤一律包一層 DrizzleQueryError（訊息開頭
// "Failed query: ..."），實際的 pg 錯誤（含 code/constraint）被放在
// `.cause`，不是丟出來的這層本身——直接讀 err.code 永遠是 undefined，得沿著
// `.cause` 往下找才拿得到，見 node_modules/drizzle-orm/errors.js 的
// DrizzleQueryError。這裡最多往下找 5 層，避免萬一某個 cause 意外形成循環
// 參照時無窮迴圈。
function pgErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let i = 0; i < 5 && current; i++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

// 23505 = unique_violation。呼叫端擋住的 catch 區塊用這個判斷是不是「唯一
// 鍵衝突」（例如同一個學號被搶先綁定、或改成已經有人在用的學號），跟其他
// 種類的資料庫錯誤（連線失敗等，應該直接往外丟讓錯誤頁接手）分開處理。
export function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === '23505';
}
