import 'server-only';

import { randomInt } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { createId } from '@/db/id';
import { db, schema } from '@/db';
import { sendOTPEmail } from '@/lib/email';

// 學號綁定用的學校信箱驗證，跟帳號本身的登入方式（email+password、Google
// 等）完全分開——目的只是證明「這個使用者真的拿得到這個學校信箱」，藉此
// 比對出學號，不會去讀寫 user/account 表，也不會改動帳號的登入 email。
// 借用既有的 verification 表存驗證碼，identifier 同時綁 userId + email，
// 這樣同一組驗證碼只能被本人、針對本次輸入的信箱使用。
const OTP_TTL_MS = 5 * 60 * 1000; // 對應 email 樣板文案「5 分鐘內有效」
const MAX_ATTEMPTS = 5;

function identifierFor(userId: string, email: string) {
  return `school-email-otp:${userId}:${email.toLowerCase()}`;
}

function generateOtp() {
  // 密碼學安全亂數，而不是 Math.random()——攻擊面已經靠嘗試次數上限跟效期
  // 擋住暴力猜測，但既然同專案其他地方（QR token）都走正規加密函式庫，
  // 亂數來源也該一致，不要留一個相對弱的產生方式。
  return String(randomInt(100000, 1000000));
}

export async function sendSchoolEmailOtp(userId: string, email: string) {
  const identifier = identifierFor(userId, email);
  const otp = generateOtp();

  // 同一個 user+email 重新寄送就蓋掉舊碼，不堆積過期紀錄。
  await db.delete(schema.verification).where(eq(schema.verification.identifier, identifier));
  await db.insert(schema.verification).values({
    id: createId(),
    identifier,
    value: `${otp}:0`,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });

  await sendOTPEmail({ email, otp, type: 'school-email-verification' });
}

export async function verifySchoolEmailOtp(
  userId: string,
  email: string,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const identifier = identifierFor(userId, email);

  const [row] = await db
    .select()
    .from(schema.verification)
    .where(eq(schema.verification.identifier, identifier))
    .limit(1);

  if (!row || row.expiresAt < new Date()) {
    return { ok: false, error: '驗證碼已過期，請重新寄送' };
  }

  const [storedOtp, attemptsRaw] = row.value.split(':');
  const attempts = Number(attemptsRaw ?? '0');
  if (attempts >= MAX_ATTEMPTS) {
    await db.delete(schema.verification).where(eq(schema.verification.id, row.id));
    return { ok: false, error: '嘗試次數過多，請重新寄送驗證碼' };
  }

  if (storedOtp !== code.trim()) {
    await db
      .update(schema.verification)
      .set({ value: `${storedOtp}:${attempts + 1}` })
      .where(eq(schema.verification.id, row.id));
    return { ok: false, error: '驗證碼不正確' };
  }

  // 驗證碼一次性，成功後即刪除，避免被重複使用。
  await db.delete(schema.verification).where(eq(schema.verification.id, row.id));
  return { ok: true };
}
