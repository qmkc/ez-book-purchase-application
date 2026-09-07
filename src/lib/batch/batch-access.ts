import 'server-only';

import { and, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { db, schema } from '@/db';
import { requireRole } from '@/lib/auth/session';

// 某梯次的承辦權限檢查：admin 一律放行（超級使用者，不受白名單限制）；
// staff 需要出現在該梯次的 preorderBatchStaff 白名單裡才算有權限。
// 用在所有「標記付款/取貨」相關的 server action 開頭。
export async function requireBatchStaffAccess(batchId: string) {
  const session = await requireRole(['staff', 'admin']);
  if (session.user.role === 'admin') return session;

  const [staffRow] = await db
    .select({ id: schema.preorderBatchStaff.id })
    .from(schema.preorderBatchStaff)
    .where(
      and(
        eq(schema.preorderBatchStaff.batchId, batchId),
        eq(schema.preorderBatchStaff.userId, session.user.id),
      ),
    )
    .limit(1);

  if (!staffRow) {
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
