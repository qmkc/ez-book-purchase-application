import 'server-only';

import { SignJWT, jwtVerify } from 'jose';

// 學生端顯示成 QR code 的短效 token，承辦人員掃描/輸入後用來核對是哪張預購單。
// 見 src/db/schema/preorder/preorder.ts 對這組設計的完整說明：HS256、90 秒
// 效期、故意不做單次有效的重放檢查，冒用由承辦人員當面核對本人擋下。
const EXPIRES_IN_SECONDS = 90;

function getSecret() {
  const secret = process.env.QR_TOKEN_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error('QR_TOKEN_SECRET / BETTER_AUTH_SECRET 未設定');
  }
  return new TextEncoder().encode(secret);
}

export async function signPreorderCode(preorderId: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(preorderId)
    .setIssuedAt()
    .setExpirationTime(`${EXPIRES_IN_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyPreorderCode(
  token: string,
): Promise<{ preorderId: string } | { error: string }> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub) return { error: '代碼格式不正確' };
    return { preorderId: payload.sub };
  } catch {
    return { error: '代碼已過期或無效，請學生重新整理頁面後再試一次' };
  }
}
