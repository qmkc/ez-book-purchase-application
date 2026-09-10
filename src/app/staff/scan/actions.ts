'use server';

import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db, schema } from '@/db';
import { writeAuditLog } from '@/lib/audit';
import { requireRole } from '@/lib/auth/session';
import {
  listAccessibleBatchIds,
  requireBatchesStaffAccess,
} from '@/lib/batch/batch-access';
import { deriveOrderStatusKey } from '@/lib/order-status';
import { verifyPreorderCode } from '@/lib/qr-token';
import {
  getRosterInfoByUserId,
  type RosterVerificationStatus,
} from '@/lib/roster/roster-lookup';

const SOURCE = '聯合掃描';

export type ScannableBatch = {
  id: string;
  name: string;
  status: 'draft' | 'open' | 'closed';
};

// 給「聯合模式」的梯次選擇器用：只列出目前使用者有權限承辦的梯次（admin
// 看全部）。草稿梯次還沒真的開放收單、不會有訂單，排除掉。
export async function getScannableBatches(): Promise<ScannableBatch[]> {
  const session = await requireRole(['staff', 'admin']);
  const accessibleIds = await listAccessibleBatchIds(
    session.user.id,
    session.user.role as string,
  );
  const notDraft = ne(schema.preorderBatch.status, 'draft');

  if (accessibleIds !== null && accessibleIds.length === 0) return [];

  return db
    .select({
      id: schema.preorderBatch.id,
      name: schema.preorderBatch.name,
      status: schema.preorderBatch.status,
    })
    .from(schema.preorderBatch)
    .where(
      accessibleIds === null
        ? notDraft
        : and(inArray(schema.preorderBatch.id, accessibleIds), notDraft),
    )
    .orderBy(desc(schema.preorderBatch.createdAt));
}

export type CombinedOrderEntry = {
  batchId: string;
  batchName: string;
  preorderId: string;
  paymentStatus: 'unpaid' | 'paid';
  pickupStatus: 'pending' | 'fulfilled';
  cancelledAt: string | null;
  totalAmount: number;
  items: { title: string; quantity: number; unitPrice: number }[];
};

export type CombinedScanSummary = {
  studentName: string;
  studentEmail: string;
  studentId: string | null;
  rosterVerificationStatus: RosterVerificationStatus;
  // 依選取梯次列出的每一筆訂單；學生在某個選取梯次沒下單就不會有對應的列，
  // 不會硬塞一筆空訂單進來。
  orders: CombinedOrderEntry[];
  // 所選梯次中「還沒收到錢、也沒被取消」的訂單金額加總，現場核對/收現金
  // 用這個數字，不是把 orders 全部金額加起來（已付款的不該再收一次）。
  unpaidTotalAmount: number;
};

// 掃描/貼上學生出示的代碼（代碼本身只對應到「一筆」訂單，見 qr-token.ts），
// 找出這筆訂單的學生是誰之後，回頭在「所有選取的梯次」裡查這位學生名下的
// 每一筆訂單，合併成一份摘要——這就是「聯合模式」的核心：一次掃描涵蓋
// 多個梯次的金額，不用每個梯次各掃一次。
export async function lookupCombinedOrderByCode(
  batchIds: string[],
  code: string,
): Promise<
  { ok: false; error: string } | { ok: true; summary: CombinedScanSummary }
> {
  if (batchIds.length === 0) {
    return { ok: false, error: '請先選擇要合併收款/核對的梯次' };
  }
  await requireBatchesStaffAccess(batchIds);

  const result = await verifyPreorderCode(code.trim());
  if ('error' in result) return { ok: false, error: result.error };

  const scannedOrder = await db.query.preorder.findFirst({
    where: (row, { eq }) => eq(row.id, result.preorderId),
  });
  if (!scannedOrder) return { ok: false, error: '找不到此訂單' };
  if (!batchIds.includes(scannedOrder.batchId)) {
    return {
      ok: false,
      error: '此代碼所屬的梯次不在目前選取的範圍內，請確認是否選錯梯次',
    };
  }

  const [orders, user, roster] = await Promise.all([
    db.query.preorder.findMany({
      where: (row, { and, eq, inArray }) =>
        and(eq(row.userId, scannedOrder.userId), inArray(row.batchId, batchIds)),
      with: { items: { with: { book: true } }, batch: true },
    }),
    db.query.user.findFirst({
      where: (row, { eq }) => eq(row.id, scannedOrder.userId),
    }),
    getRosterInfoByUserId(scannedOrder.userId),
  ]);
  if (!user) return { ok: false, error: '找不到此學生帳號' };

  const entries: CombinedOrderEntry[] = orders
    .map((order) => ({
      batchId: order.batchId,
      batchName: order.batch.name,
      preorderId: order.id,
      paymentStatus: order.paymentStatus,
      pickupStatus: order.pickupStatus,
      cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
      totalAmount: order.totalAmount,
      items: order.items.map((item) => ({
        title: item.book.title,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    }))
    .sort((a, b) => a.batchName.localeCompare(b.batchName, 'zh-Hant'));

  const unpaidTotalAmount = entries
    .filter((entry) => !entry.cancelledAt && entry.paymentStatus === 'unpaid')
    .reduce((sum, entry) => sum + entry.totalAmount, 0);

  return {
    ok: true,
    summary: {
      studentName: user.name,
      studentEmail: user.email,
      studentId: roster?.studentId ?? null,
      rosterVerificationStatus: roster?.verificationStatus ?? 'unbound',
      orders: entries,
      unpaidTotalAmount,
    },
  };
}

// 一次把多筆訂單（橫跨不同梯次）標記為已付款。已取消或已付款的訂單直接
// 略過視為冪等，不會擋住其他還沒處理的訂單；每一筆真的有異動的訂單各自
// 開一筆 payment 交易、各自寫一筆稽核紀錄——聯合模式只是讓工作人員一次
// 按一個按鈕，資料庫裡仍然是每個梯次各自獨立的付款紀錄，跟分開掃描的結果
// 完全一致。
export async function markPaidCombined(
  preorderIds: string[],
): Promise<{ error?: string }> {
  if (preorderIds.length === 0) return { error: '沒有可標記的訂單' };

  const orders = await db.query.preorder.findMany({
    where: (row, { inArray }) => inArray(row.id, preorderIds),
    with: { payments: true },
  });
  if (orders.length === 0) return { error: '找不到訂單' };

  const batchIds = [...new Set(orders.map((order) => order.batchId))];
  const session = await requireBatchesStaffAccess(batchIds);

  for (const order of orders) {
    if (order.cancelledAt || order.paymentStatus === 'paid') continue; // 冪等

    const payment = order.payments[0];
    await db.transaction(async (tx) => {
      if (payment) {
        await tx
          .update(schema.payment)
          .set({
            status: 'succeeded',
            paidAt: new Date(),
            confirmedBy: session.user.id,
            // 見 batches/[batchId]/actions.ts 的 markPaid 同一段說明：重新
            // 標記為已付款時要清掉舊的退款欄位，否則會撞上
            // payment_refundedAt_check。
            refundedAmount: null,
            refundReason: null,
            refundedAt: null,
            refundedBy: null,
          })
          .where(eq(schema.payment.id, payment.id));
      } else {
        await tx.insert(schema.payment).values({
          preorderId: order.id,
          amount: order.totalAmount,
          status: 'succeeded',
          paidAt: new Date(),
          confirmedBy: session.user.id,
        });
      }
      await tx
        .update(schema.preorder)
        .set({ paymentStatus: 'paid' })
        .where(eq(schema.preorder.id, order.id));
    });

    await writeAuditLog({
      actorId: session.user.id,
      action: 'preorder.status_changed',
      entityType: 'preorder',
      entityId: order.id,
      before: { status: deriveOrderStatusKey(order) },
      after: {
        status: deriveOrderStatusKey({ ...order, paymentStatus: 'paid' }),
        source: SOURCE,
      },
    });

    revalidatePath(`/staff/batches/${order.batchId}`);
  }

  return {};
}

// 一次把多筆訂單標記為已取貨；跟單一梯次的 markFulfilled 一樣，未付款的
// 訂單預設要先跳確認框（allowUnpaid），這裡把「所有還沒處理、且未付款」
// 的梯次名稱一起回報給前端顯示，工作人員一次確認就能連同已付款的一起送出。
export async function markFulfilledCombined(
  preorderIds: string[],
  allowUnpaid: boolean = false,
): Promise<{ error?: string; unpaidBatchNames?: string[] }> {
  if (preorderIds.length === 0) return { error: '沒有可標記的訂單' };

  const orders = await db.query.preorder.findMany({
    where: (row, { inArray }) => inArray(row.id, preorderIds),
    with: { batch: true },
  });
  if (orders.length === 0) return { error: '找不到訂單' };

  const batchIds = [...new Set(orders.map((order) => order.batchId))];
  const session = await requireBatchesStaffAccess(batchIds);

  const actionable = orders.filter(
    (order) => !order.cancelledAt && order.pickupStatus !== 'fulfilled',
  );

  if (!allowUnpaid) {
    const unpaid = actionable.filter((order) => order.paymentStatus === 'unpaid');
    if (unpaid.length > 0) {
      return { unpaidBatchNames: unpaid.map((order) => order.batch.name) };
    }
  }

  for (const order of actionable) {
    await db
      .update(schema.preorder)
      .set({
        pickupStatus: 'fulfilled',
        fulfilledAt: new Date(),
        fulfilledBy: session.user.id,
      })
      .where(eq(schema.preorder.id, order.id));

    await writeAuditLog({
      actorId: session.user.id,
      action: 'preorder.status_changed',
      entityType: 'preorder',
      entityId: order.id,
      before: { status: deriveOrderStatusKey(order) },
      after: {
        status: deriveOrderStatusKey({ ...order, pickupStatus: 'fulfilled' }),
        markedUnpaid: order.paymentStatus === 'unpaid',
        source: SOURCE,
      },
    });

    revalidatePath(`/staff/batches/${order.batchId}`);
  }

  return {};
}
