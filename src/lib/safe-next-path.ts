// 共用的「登入後導回頁」淨化邏輯：只接受站內相對路徑，擋掉絕對網址
// （https://evil.com）跟 protocol-relative 網址（//evil.com，瀏覽器會當成
// 外部網域），避免 next 參數被用來做 open redirect。「/」開頭但緊接著第二個
// 「/」或「\」也一併擋，那樣的字串一樣會被瀏覽器解析成外部網址。
//
// login-form.tsx 跟 bind-roster 都需要這段邏輯（新帳號登入會先繞去
// /bind-roster、完成後才導去原本要去的頁面），拆出來避免兩邊各自維護一份、
// 邊界條件不小心兜不起來。
export function sanitizeNextPath(raw: string | null | undefined): string {
  if (
    raw &&
    raw.startsWith('/') &&
    !raw.startsWith('//') &&
    !raw.startsWith('/\\')
  ) {
    return raw;
  }
  return '/';
}
