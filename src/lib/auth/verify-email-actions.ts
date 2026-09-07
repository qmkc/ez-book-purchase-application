'use server';

import { headers } from 'next/headers';

import { writeAuditLog } from '@/lib/audit';
import { auth } from '@/lib/auth/auth';
import { requireSession } from '@/lib/auth/session';

// 驗證碼「發送」本身不算狀態異動（跟 sendSchoolEmailBindOtp 等其他寄送 OTP
// 的動作一樣不記稽核），所以 VerifyEmailBanner 的寄送仍直接呼叫
// authClient.emailOtp.sendVerificationOtp；只有「驗證成功」這個真的把
// user.emailVerified 從 false 改成 true 的異動需要走 server action，才能
// 補上一筆稽核紀錄——better-auth 的 emailOTP plugin 沒有自己的異動紀錄
// 機制，直接讓前端呼叫 authClient.emailOtp.verifyEmail 的話這個異動就完全
// 不會出現在 /admin/audit-log。這裡包一層 auth.api.verifyEmailOTP，驗證
// 成功後手動補寫一筆 writeAuditLog。
export async function verifyLoginEmail(
  email: string,
  otp: string,
): Promise<{ error?: string }> {
  const session = await requireSession();

  try {
    await auth.api.verifyEmailOTP({
      body: { email, otp },
      headers: await headers(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '驗證碼錯誤或已過期';
    return { error: message };
  }

  await writeAuditLog({
    actorId: session.user.id,
    action: 'user.email_verified',
    entityType: 'user',
    entityId: session.user.id,
    after: { email },
  });

  return {};
}
