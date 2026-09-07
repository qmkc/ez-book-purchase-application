import 'server-only';

import { and, eq, isNull, lte, or } from 'drizzle-orm';

import { db, schema } from '@/db';
import { writeAuditLog } from '@/lib/audit';
import {
  sendRosterPendingAdminAlertEmail,
  sendRosterPendingReminderEmail,
} from '@/lib/email';

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
    // 但這裡直接當 JSX 內容傳給 email 樣板，React 本身就會逸出文字節點，
    // 不用再自己跳脫一次。
    try {
      await sendRosterPendingReminderEmail({
        to: row.claimedByUser.email,
        studentId: row.studentId,
        realName: row.realName,
      });

      for (const admin of admins) {
        await sendRosterPendingAdminAlertEmail({
          to: admin.email,
          studentId: row.studentId,
          realName: row.realName,
          claimedByEmail: row.claimedByUser.email,
          thresholdDays: REMINDER_THRESHOLD_DAYS,
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
