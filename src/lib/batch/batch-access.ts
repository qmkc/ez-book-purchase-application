import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { db, schema } from '@/db';
import { requireRole } from '@/lib/auth/session';

// 某梯次的承辦權限檢查：admin 一律放行（超級使用者，不受白名單限制）；
// staff 需要出現在該梯次的 preorderBatchStaff 白名單裡才算有權限。
// 用在所有「標記付款/取貨」相關的 server action 開頭。
export async function requireBatchStaffAccess(batchId: string) {
  return requireBatchesStaffAccess([batchId]);
}

// requireBatchStaffAccess 的多梯次版本：全部梯次都要有權限才放行，用在
// 「聯合掃描」這種一次橫跨多個梯次的操作（見 src/app/staff/scan/actions.ts）——
// 故意要求「每一個」都通過，不是「至少一個」，避免工作人員把沒有權限的梯次
// 也偷偷塞進合併範圍。
export async function requireBatchesStaffAccess(batchIds: string[]) {
  const session = await requireRole(['staff', 'admin']);
  if (session.user.role === 'admin') return session;
  if (batchIds.length === 0) return session;

  const staffRows = await db
    .select({ batchId: schema.preorderBatchStaff.batchId })
    .from(schema.preorderBatchStaff)
    .where(
      and(
        inArray(schema.preorderBatchStaff.batchId, batchIds),
        eq(schema.preorderBatchStaff.userId, session.user.id),
      ),
    );

  const allowedBatchIds = new Set(staffRows.map((row) => row.batchId));
  if (batchIds.some((id) => !allowedBatchIds.has(id))) {
    redirect('/staff');
  }
  return session;
}

// admin 或 staff 是否對此梯次有權限，不拋錯，用於篩選清單。
export async function listAccessibleBatchIds(userId: string, role: string) {
  if (role === 'admin') return null; // null 代表「全部」
  const rows = await db
    .select({ batchId: schema.preorderBatchStaff.batchId })
    .from(schema.preorderBatchStaff)
    .where(eq(schema.preorderBatchStaff.userId, userId));
  return rows.map((r) => r.batchId);
}
