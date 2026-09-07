'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db, schema } from '@/db';
import { writeAuditLog } from '@/lib/audit';
import { requireBatchStaffAccess } from '@/lib/batch/batch-access';
import { deriveOrderStatusKey } from '@/lib/order-status';
import { verifyPreorderCode } from '@/lib/qr-token';

async function loadOrderInBatch(preorderId: string, batchId: string) {
  const preorder = await db.query.preorder.findFirst({
    where: (row, { eq }) => eq(row.id, preorderId),
    with: { user: true, items: { with: { book: true } }, payments: true },
  });
  if (!preorder || preorder.batchId !== batchId) return null;
  return preorder;
}

export type ScannedOrderSummary = {
  preorderId: string;
  paymentStatus: 'unpaid' | 'paid';
  pickupStatus: 'pending' | 'fulfilled';
  cancelledAt: string | null;
  studentName: string;
  studentEmail: string;
  totalAmount: number;
  items: { title: string; quantity: number; unitPrice: number }[];
};

// 掃描/貼上學生出示的代碼，找出對應的訂單摘要供承辦人員核對。代碼本身不
// 記錄要做哪個動作，回傳完整摘要（是否購買、購買數量等等）讓掃描端就地
// 顯示、就地確認，不用另外跳頁面、不用再多點其他按鈕找對應的動作。
export async function lookupOrderByCode(
  batchId: string,
  code: string,
): Promise<
  { ok: false; error: string } | { ok: true; summary: ScannedOrderSummary }
> {
  await requireBatchStaffAccess(batchId);

  const result = await verifyPreorderCode(code.trim());
  if ('error' in result) return { ok: false, error: result.error };

  const order = await loadOrderInBatch(result.preorderId, batchId);
  if (!order) return { ok: false, error: '此代碼不屬於目前這個梯次' };

  return {
    ok: true,
    summary: {
      preorderId: order.id,
      paymentStatus: order.paymentStatus,
      pickupStatus: order.pickupStatus,
      cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
      studentName: order.user.name,
      studentEmail: order.user.email,
      totalAmount: order.totalAmount,
      items: order.items.map((item) => ({
        title: item.book.title,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    },
  };
}

export async function markPaid(preorderId: string, batchId: string) {
  const session = await requireBatchStaffAccess(batchId);

  const order = await loadOrderInBatch(preorderId, batchId);
  if (!order) return { error: '找不到此訂單' };
  if (order.cancelledAt) return { error: '此訂單已取消，無法標記付款' };
  if (order.paymentStatus === 'paid') return {}; // 已經標記過，視為冪等成功

  // 故意不檢查 pickupStatus——已經先讓學生取貨、錢晚點才收的訂單
  // （markFulfilled 的 allowUnpaid）也要能在這裡補標付款，付款跟取貨兩個
  // 維度各自獨立推進，不會因為書已經交出去就再也無法標記收到錢。
  const payment = order.payments[0];

  await db.transaction(async (tx) => {
    if (payment) {
      await tx
        .update(schema.payment)
        .set({
          status: 'succeeded',
          paidAt: new Date(),
          confirmedBy: session.user.id,
        })
        .where(eq(schema.payment.id, payment.id));
    } else {
      await tx.insert(schema.payment).values({
        preorderId,
        amount: order.totalAmount,
        status: 'succeeded',
        paidAt: new Date(),
        confirmedBy: session.user.id,
      });
    }
    await tx
      .update(schema.preorder)
      .set({ paymentStatus: 'paid' })
      .where(eq(schema.preorder.id, preorderId));
  });

  await writeAuditLog({
    actorId: session.user.id,
    action: 'preorder.status_changed',
    entityType: 'preorder',
    entityId: preorderId,
    before: { status: deriveOrderStatusKey(order) },
    after: {
      status: deriveOrderStatusKey({ ...order, paymentStatus: 'paid' }),
    },
  });

  revalidatePath(`/staff/batches/${batchId}`);
  return {};
}

// allowUnpaid：允許在還沒標記付款的情況下先取貨（例如現場另外用現金結清、
// 貨到付款等情境）。故意要求前端明確帶 true 才放行，避免程式碼哪裡不小心
// 呼叫到這支就悄悄放行未付款訂單——client 端也要另外跳確認框把關一次。
export async function markFulfilled(
  preorderId: string,
  batchId: string,
  pickupLocation: string,
  allowUnpaid: boolean = false,
): Promise<{ error?: string; needsUnpaidConfirmation?: boolean }> {
  const session = await requireBatchStaffAccess(batchId);

  const order = await loadOrderInBatch(preorderId, batchId);
  if (!order) return { error: '找不到此訂單' };
  if (order.cancelledAt) return { error: '此訂單已取消，無法標記取貨' };
  if (order.pickupStatus === 'fulfilled') return {}; // 冪等
  if (order.paymentStatus === 'unpaid' && !allowUnpaid) {
    return { needsUnpaidConfirmation: true };
  }

  await db
    .update(schema.preorder)
    .set({
      pickupStatus: 'fulfilled',
      fulfilledAt: new Date(),
      fulfilledBy: session.user.id,
      pickupLocation: pickupLocation.trim() || null,
    })
    .where(eq(schema.preorder.id, preorderId));

  await writeAuditLog({
    actorId: session.user.id,
    action: 'preorder.status_changed',
    entityType: 'preorder',
    entityId: preorderId,
    before: { status: deriveOrderStatusKey(order) },
    after: {
      status: deriveOrderStatusKey({ ...order, pickupStatus: 'fulfilled' }),
      pickupLocation,
      markedUnpaid: order.paymentStatus === 'unpaid',
    },
  });

  revalidatePath(`/staff/batches/${batchId}`);
  return {};
}

// 撤銷「已取貨」——通常是掃描核對時手滑/掃到不對的人，需要在「更多操作」
// 裡快速切回未取貨。跟 markFulfilled 對稱：清掉 fulfilledAt/fulfilledBy，
// pickupLocation 保留（單純一個地點註記，不是狀態的一部分，沒理由跟著清）。
export async function unmarkFulfilled(
  preorderId: string,
  batchId: string,
  reason: string,
) {
  const session = await requireBatchStaffAccess(batchId);

  const order = await loadOrderInBatch(preorderId, batchId);
  if (!order) return { error: '找不到此訂單' };
  if (order.cancelledAt) return { error: '此訂單已取消' };
  if (order.pickupStatus !== 'fulfilled') return {}; // 已經是未取貨，視為冪等成功

  await db
    .update(schema.preorder)
    .set({ pickupStatus: 'pending', fulfilledAt: null, fulfilledBy: null })
    .where(eq(schema.preorder.id, preorderId));

  await writeAuditLog({
    actorId: session.user.id,
    action: 'preorder.status_changed',
    entityType: 'preorder',
    entityId: preorderId,
    before: { status: deriveOrderStatusKey(order) },
    after: {
      status: deriveOrderStatusKey({ ...order, pickupStatus: 'pending' }),
      reason,
    },
  });

  revalidatePath(`/staff/batches/${batchId}`);
  return {};
}

export async function cancelPreorderByStaff(
  preorderId: string,
  batchId: string,
  reason: string,
) {
  const session = await requireBatchStaffAccess(batchId);

  const order = await loadOrderInBatch(preorderId, batchId);
  if (!order) return { error: '找不到此訂單' };
  if (order.pickupStatus === 'fulfilled' || order.cancelledAt) {
    return { error: '此訂單狀態無法取消' };
  }
  if (!reason.trim()) return { error: '請填寫取消原因' };

  await db
    .update(schema.preorder)
    .set({
      cancelledAt: new Date(),
      cancelledBy: session.user.id,
      cancelReason: reason.trim(),
    })
    .where(eq(schema.preorder.id, preorderId));

  await writeAuditLog({
    actorId: session.user.id,
    action: 'preorder.cancelled',
    entityType: 'preorder',
    entityId: preorderId,
    before: { status: deriveOrderStatusKey(order) },
    after: { status: 'cancelled', cancelReason: reason },
  });

  revalidatePath(`/staff/batches/${batchId}`);
  return {};
}

export async function refundPayment(
  preorderId: string,
  batchId: string,
  amount: number,
  reason: string,
) {
  const session = await requireBatchStaffAccess(batchId);

  const order = await loadOrderInBatch(preorderId, batchId);
  if (!order) return { error: '找不到此訂單' };
  const payment = order.payments.find((p) => p.status === 'succeeded');
  if (!payment) return { error: '此訂單沒有已付款的紀錄可退款' };
  if (!Number.isFinite(amount) || amount <= 0 || amount > payment.amount) {
    return { error: '退款金額需大於 0 且不超過原付款金額' };
  }
  if (!reason.trim()) return { error: '請填寫退款原因' };

  // 退款後這筆訂單就不算「已收款」了，不論是全額還是部分退款——跟退款前
  // preorder.paymentStatus 一定是 'paid'（否則走不到這裡，payment.status
  // 一定是 succeeded）相呼應，退完就改回 'unpaid'，之後承辦人員還能透過
  // markPaid 重新補標（例如學生後來又補款）。
  await db.transaction(async (tx) => {
    await tx
      .update(schema.payment)
      .set({
        status: 'refunded',
        refundedAmount: Math.floor(amount),
        refundReason: reason.trim(),
        refundedAt: new Date(),
        refundedBy: session.user.id,
      })
      .where(eq(schema.payment.id, payment.id));

    await tx
      .update(schema.preorder)
      .set({ paymentStatus: 'unpaid' })
      .where(eq(schema.preorder.id, preorderId));
  });

  await writeAuditLog({
    actorId: session.user.id,
    action: 'payment.refunded',
    entityType: 'payment',
    entityId: payment.id,
    before: { status: payment.status },
    after: { status: 'refunded', amount, reason },
  });

  revalidatePath(`/staff/batches/${batchId}`);
  return {};
}
