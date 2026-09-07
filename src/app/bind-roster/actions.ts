'use server';

import { eq, sql } from 'drizzle-orm';

import { db, schema } from '@/db';
import { writeAuditLog } from '@/lib/audit';
import {
  parseStudentIdFromSchoolEmail,
  SCHOOL_EMAIL_DOMAIN,
} from '@/lib/roster/school';
import {
  sendSchoolEmailOtp,
  verifySchoolEmailOtp,
} from '@/lib/roster/school-email-otp';
import { requireSession } from '@/lib/auth/session';

async function alreadyClaimedByUser(userId: string) {
  const [existingClaim] = await db
    .select({ id: schema.studentRoster.id })
    .from(schema.studentRoster)
    .where(eq(schema.studentRoster.claimedByUserId, userId))
    .limit(1);
  return Boolean(existingClaim);
}

function isUniqueViolation(err: unknown) {
  return (err as { code?: string })?.code === '23505';
}

// 綁定不要求學號 + 姓名一定要對上既有匯入資料才會成功：
// - 查得到既有（必然是管理員匯入、尚未被綁定的）名冊資料就直接接手綁定，
//   不覆蓋原本的姓名；姓名剛好也對得上，或用學校信箱比對出來的，視為系統
//   自動核實，否則先讓學生能用，正確性留給管理員之後人工核實。
// - 查無這個學號就直接用自報內容建一筆新的（email 方式因為信箱本身已經
//   驗證過，一樣視為已核實；data 方式則待人工核實）。
// 唯一會擋下來的情況是這個學號已經被「別的帳號」綁定走了。
// 回傳的 matched 讓呼叫端知道「資料庫裡本來就有沒有這個學號」，查無資料時
// 要讓使用者清楚看到「已用您填寫的資料先建立，資料庫目前查無您的學號」，
// 不能悄悄成功、讓人以為自己的資料本來就在名冊裡。
async function claimStudentId({
  userId,
  studentId,
  realNameForNewRow,
  claimMethod,
  caseInsensitive,
}: {
  userId: string;
  studentId: string;
  realNameForNewRow: string;
  claimMethod: 'data' | 'email';
  caseInsensitive: boolean;
}): Promise<{ error?: string; matched?: boolean }> {
  const studentIdCondition = caseInsensitive
    ? eq(sql`lower(${schema.studentRoster.studentId})`, studentId.toLowerCase())
    : eq(schema.studentRoster.studentId, studentId);

  const [existingRow] = await db
    .select()
    .from(schema.studentRoster)
    .where(studentIdCondition)
    .limit(1);

  if (existingRow?.claimedByUserId && existingRow.claimedByUserId !== userId) {
    return {
      error:
        '此學號已經被其他帳號綁定，請確認學號是否輸入正確；如有疑問請聯繫開發人員 - qmkcat@gmail.com',
    };
  }

  const now = new Date();

  if (existingRow) {
    const autoVerified =
      claimMethod === 'email' || existingRow.realName === realNameForNewRow;
    await db
      .update(schema.studentRoster)
      .set({
        claimedByUserId: userId,
        claimedAt: now,
        claimMethod,
        verifiedAt: autoVerified ? now : null,
        verifiedBy: null,
      })
      .where(eq(schema.studentRoster.id, existingRow.id));

    await writeAuditLog({
      actorId: userId,
      action: 'student_roster.claimed',
      entityType: 'student_roster',
      entityId: existingRow.id,
      after: { claimedByUserId: userId, claimMethod, autoVerified },
    });
    return { matched: true };
  }

  try {
    const [created] = await db
      .insert(schema.studentRoster)
      .values({
        studentId,
        realName: realNameForNewRow,
        claimedByUserId: userId,
        claimedAt: now,
        claimMethod,
        verifiedAt: claimMethod === 'email' ? now : null,
      })
      .returning({ id: schema.studentRoster.id });

    await writeAuditLog({
      actorId: userId,
      action: 'student_roster.claimed',
      entityType: 'student_roster',
      entityId: created.id,
      after: { claimedByUserId: userId, claimMethod, selfReported: true },
    });
    return { matched: false };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { error: '此學號剛好被別人搶先綁定，請重新整理後再試一次' };
    }
    throw err;
  }
}

// 方式一：手動輸入學號 + 真實姓名。
export async function bindRoster(
  _prevState:
    | { error?: string; success?: boolean; matched?: boolean }
    | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean; matched?: boolean }> {
  const session = await requireSession('/bind-roster');

  const studentId = String(formData.get('studentId') ?? '').trim();
  const realName = String(formData.get('realName') ?? '').trim();

  if (!studentId || !realName) {
    return { error: '請輸入學號與真實姓名' };
  }

  // 一個帳號只能綁定一筆名冊，先擋掉已經綁過的情況（DB 的 unique 也會擋，
  // 但先在這裡擋可以給出比較明確的訊息）。
  if (await alreadyClaimedByUser(session.user.id)) {
    return { error: '此帳號已經完成綁定，無法重複綁定' };
  }

  const result = await claimStudentId({
    userId: session.user.id,
    studentId,
    realNameForNewRow: realName,
    claimMethod: 'data',
    // 跟 email 綁定方式一樣改用不分大小寫比對——管理員匯入的學號大小寫不一定
    // 跟學生自己輸入的一致，用精確比對會找不到既有資料而誤建出重複的一筆
    // （見 code review 發現的比對不一致問題）。
    caseInsensitive: true,
  });
  if (result.error) return result;

  return { success: true, matched: result.matched };
}

// 方式二：學校信箱（{student_id}@nfu.edu.tw）比對出學號（信任層級：最高級
// 驗證）。這裡驗證的是「使用者輸入的這個信箱」，跟帳號本身的登入 email 是
// 分開的兩件事——學生可能是用自己的 Google 帳號登入，登入 email 不必然是
// 學校信箱，所以另外開一個欄位讓使用者輸入、獨立驗證，不去動帳號登入資料。

export async function sendSchoolEmailBindOtp(
  _prevState: { error?: string; sent?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; sent?: boolean }> {
  const session = await requireSession('/bind-roster');

  if (await alreadyClaimedByUser(session.user.id)) {
    return { error: '此帳號已經完成綁定，無法重複綁定' };
  }

  const email = String(formData.get('email') ?? '').trim();
  const studentId = parseStudentIdFromSchoolEmail(email);
  if (!studentId) {
    return {
      error: `請輸入正確格式的學校信箱（{學號}@${SCHOOL_EMAIL_DOMAIN}）`,
    };
  }

  try {
    await sendSchoolEmailOtp(session.user.id, email);
  } catch (err) {
    // 寄信本身失敗（例如寄信服務額度/設定問題）要讓使用者看到明確訊息，
    // 不能整個 action 丟例外把使用者導去泛用的錯誤頁。
    console.error('sendSchoolEmailBindOtp: failed to send OTP email', err);
    return {
      error:
        '驗證碼寄送失敗，請稍後再試；如持續發生請聯繫開發人員 - qmkcat@gmail.com',
    };
  }
  return { sent: true };
}

export async function verifySchoolEmailBindOtp(
  _prevState:
    | { error?: string; success?: boolean; matched?: boolean }
    | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean; matched?: boolean }> {
  const session = await requireSession('/bind-roster');

  if (await alreadyClaimedByUser(session.user.id)) {
    return { error: '此帳號已經完成綁定，無法重複綁定' };
  }

  const email = String(formData.get('email') ?? '').trim();
  const code = String(formData.get('code') ?? '').trim();
  const studentId = parseStudentIdFromSchoolEmail(email);
  if (!studentId) {
    return {
      error: `請輸入正確格式的學校信箱（{學號}@${SCHOOL_EMAIL_DOMAIN}）`,
    };
  }
  if (!code) {
    return { error: '請輸入驗證碼' };
  }

  const verifyResult = await verifySchoolEmailOtp(session.user.id, email, code);
  if (!verifyResult.ok) {
    return { error: verifyResult.error };
  }

  const result = await claimStudentId({
    userId: session.user.id,
    studentId,
    // 只有在查無既有名冊資料、需要新建一筆時才會用到這個姓名；查到既有資料
    // 就直接沿用原本的姓名，不會被這裡蓋掉。
    realNameForNewRow: session.user.name,
    claimMethod: 'email',
    caseInsensitive: true,
  });
  if (result.error) return result;

  return { success: true, matched: result.matched };
}
