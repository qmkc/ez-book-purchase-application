import 'server-only';

import { and, eq, isNull, lte, or } from 'drizzle-orm';

import { db, schema } from '@/db';
import { writeAuditLog } from '@/lib/audit';
import { escapeHtml, sendNotificationEmail } from '@/lib/email';

// 綁定超過這麼多天還沒被管理員核實，才會寄提醒信（給學生本人 + 管理員）。
// 同一筆最多每隔這個天數重寄一次，不會每次有人打開 /admin/roster 就洗版信箱。
export const REMINDER_THRESHOLD_DAYS = Number(
  process.env.ROSTER_VERIFICATION_REMINDER_DAYS ?? '3',
);

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// 檢查所有「綁定超過門檻天數仍未核實」的名冊資料，寄提醒信給學生本人與全體
// 管理員，並記下 notifiedAt 避免重複寄送。刻意逐筆處理、單筆寄信失敗只記錄
// 不中斷，避免一封信寄失敗就讓其他學生的提醒也一起收不到。
export async function checkAndNotifyStaleClaims(): Promise<{
  checked: number;
  notified: number;
}> {
  const threshold = daysAgo(REMINDER_THRESHOLD_DAYS);

  const staleRows = await db.query.studentRoster.findMany({
    where: and(
      isNull(schema.studentRoster.verifiedAt),
      lte(schema.studentRoster.claimedAt, threshold),
      or(
        isNull(schema.studentRoster.notifiedAt),
        lte(schema.studentRoster.notifiedAt, threshold),
      ),
    ),
    with: { claimedByUser: true },
  });

  if (staleRows.length === 0) return { checked: 0, notified: 0 };

  const admins = await db
    .select({ email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.role, 'admin'));

  let notified = 0;

  for (const row of staleRows) {
    if (!row.claimedByUser) continue; // 理論上不會發生（有 claimedAt 就該有人），保險起見跳過
    // studentId/realName 是使用者自報的內容（見 bind-roster/actions.ts），
    // 內插進 email HTML 前務必跳脫，否則等於讓使用者能在管理員信箱裡塞任意
    // HTML（例如偽造連結）。
    const safeStudentId = escapeHtml(row.studentId);
    const safeRealName = escapeHtml(row.realName);
    const safeClaimedByEmail = escapeHtml(row.claimedByUser.email);
    try {
      await sendNotificationEmail({
        to: row.claimedByUser.email,
        subject: '學號綁定資料尚待核實',
        html: `
          <div style="font-family: sans-serif; font-size: 16px; color: #111827;">
            <p>您好，您先前填寫的學號（${safeStudentId}）與姓名（${safeRealName}）綁定資料，
            目前尚未經管理員核實。</p>
            <p style="color: #6b7280; font-size: 14px;">
              這不影響您現在下單，但建議確認學號與姓名是否填寫正確；
              如有疑問請聯繫教務處。
            </p>
          </div>
        `,
      });

      for (const admin of admins) {
        await sendNotificationEmail({
          to: admin.email,
          subject: '有學號綁定資料等待核實',
          html: `
            <div style="font-family: sans-serif; font-size: 16px; color: #111827;">
              <p>學號 ${safeStudentId}（${safeRealName}，${safeClaimedByEmail}）
              的綁定資料已超過 ${REMINDER_THRESHOLD_DAYS} 天尚未核實，請至後台
              /admin/roster 確認。</p>
            </div>
          `,
        });
      }

      await db
        .update(schema.studentRoster)
        .set({ notifiedAt: new Date() })
        .where(eq(schema.studentRoster.id, row.id));

      await writeAuditLog({
        actorId: null,
        action: 'student_roster.pending_notified',
        entityType: 'student_roster',
        entityId: row.id,
        metadata: { studentId: row.studentId },
      });

      notified += 1;
    } catch (err) {
      console.error(
        `checkAndNotifyStaleClaims: 寄送提醒信失敗（roster id: ${row.id}）`,
        err,
      );
    }
  }

  return { checked: staleRows.length, notified };
}
