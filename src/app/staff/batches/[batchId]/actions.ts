'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db, schema } from '@/db';
import { writeAuditLog } from '@/lib/audit';
import { requireBatchStaffAccess } from '@/lib/batch/batch-access';
import { getCumulativeQuantities } from '@/lib/batch/batch-catalog';
import { resolveTierPrice } from '@/lib/batch/pricing';
import { resyncOpenBatchBookPricing } from '@/lib/batch/resync-pricing';
import { computeTierDiff } from '@/lib/batch/tier-diff';
import { deriveOrderStatusKey } from '@/lib/order-status';
import { verifyPreorderCode } from '@/lib/qr-token';
import {
  getRosterInfoByUserId,
  type RosterVerificationStatus,
} from '@/lib/roster/roster-lookup';

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
  realName: string | null;
  studentEmail: string;
  studentId: string | null;
  rosterVerificationStatus: RosterVerificationStatus;
  totalAmount: number;
  items: { title: string; quantity: number; unitPrice: number }[];
  // 已付款訂單付款當下鎖定的金額，跟「現在」的團購級距可能因為梯次還開放
  // 中、後續有其他人下單/取消而不同了——正值代表要跟學生補收這麼多，負值
  // 代表要退這麼多錢給學生，0 代表沒有落差。未付款訂單一律是 0（本來就還
  // 在浮動中，沒有「付款當下鎖定的金額」可比）。見 lib/batch/tier-diff.ts。
  tierDiffAmount: number;
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

  const [roster, tierDiff] = await Promise.all([
    getRosterInfoByUserId(order.userId),
    order.paymentStatus === 'paid' && !order.cancelledAt
      ? computeTierDiff(batchId, order.items)
      : Promise.resolve(null),
  ]);

  return {
    ok: true,
    summary: {
      preorderId: order.id,
      paymentStatus: order.paymentStatus,
      pickupStatus: order.pickupStatus,
      cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
      studentName: order.user.name,
      realName: roster?.realName ?? null,
      studentEmail: order.user.email,
      studentId: roster?.studentId ?? null,
      rosterVerificationStatus: roster?.verificationStatus ?? 'unbound',
      totalAmount: order.totalAmount,
      items: order.items.map((item) => ({
        title: item.book.title,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
      tierDiffAmount: tierDiff?.amount ?? 0,
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
          // 這筆 payment 上次如果是被退款/撤銷付款狀態帶到這裡（同一筆
          // 紀錄重新標記為已付款），退款相關欄位要一起清掉——否則
          // status 變回 succeeded 但 refundedAt 還留著舊值，會撞上
          // payment_refundedAt_check（該檢查約束 status = 'refunded' 才
          // 能有 refundedAt）。
          refundedAmount: null,
          refundReason: null,
          refundedAt: null,
          refundedBy: null,
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

  const bookIds = [...new Set(order.items.map((item) => item.bookId))];

  await db.transaction(async (tx) => {
    // 撤銷取貨之後，如果這張單本來就未付款，會重新落入「浮動中」的集合——
    // 這張單自己鎖定的舊單價可能已經跟目前級距不一樣，要立刻同步，不能等
    // 下一次剛好有人異動這幾本書的累積數量才順便更新。鎖法同
    // updateOrderItemQuantities。
    if (bookIds.length > 0) {
      await tx
        .select({ id: schema.preorderBatchBook.id })
        .from(schema.preorderBatchBook)
        .where(
          and(
            eq(schema.preorderBatchBook.batchId, batchId),
            inArray(schema.preorderBatchBook.bookId, bookIds),
          ),
        )
        .for('update');
    }

    await tx
      .update(schema.preorder)
      .set({ pickupStatus: 'pending', fulfilledAt: null, fulfilledBy: null })
      .where(eq(schema.preorder.id, preorderId));

    if (order.paymentStatus === 'unpaid') {
      for (const bookId of bookIds) {
        await resyncOpenBatchBookPricing(tx, batchId, bookId);
      }
    }
  });

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

  const bookIds = [...new Set(order.items.map((item) => item.bookId))];

  await db.transaction(async (tx) => {
    // 取消（即使是已付款但還沒取貨的訂單）都會讓這幾本書的累積數量變少，
    // 浮動中的其他訂單要跟著浮回去。鎖法同 updateOrderItemQuantities。
    if (bookIds.length > 0) {
      await tx
        .select({ id: schema.preorderBatchBook.id })
        .from(schema.preorderBatchBook)
        .where(
          and(
            eq(schema.preorderBatchBook.batchId, batchId),
            inArray(schema.preorderBatchBook.bookId, bookIds),
          ),
        )
        .for('update');
    }

    await tx
      .update(schema.preorder)
      .set({
        cancelledAt: new Date(),
        cancelledBy: session.user.id,
        cancelReason: reason.trim(),
      })
      .where(eq(schema.preorder.id, preorderId));

    for (const bookId of bookIds) {
      await resyncOpenBatchBookPricing(tx, batchId, bookId);
    }
  });

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

  const bookIds = [...new Set(order.items.map((item) => item.bookId))];

  // 退款後這筆訂單就不算「已收款」了，不論是全額還是部分退款——跟退款前
  // preorder.paymentStatus 一定是 'paid'（否則走不到這裡，payment.status
  // 一定是 succeeded）相呼應，退完就改回 'unpaid'，之後承辦人員還能透過
  // markPaid 重新補標（例如學生後來又補款）。退回未付款也代表這張單重新
  // 落入「浮動中」的集合，鎖定時的舊單價可能早就跟目前級距不同，退款當下
  // 要立刻同步成最新的浮動價，不能沿用退款前的鎖定價。
  await db.transaction(async (tx) => {
    if (bookIds.length > 0) {
      await tx
        .select({ id: schema.preorderBatchBook.id })
        .from(schema.preorderBatchBook)
        .where(
          and(
            eq(schema.preorderBatchBook.batchId, batchId),
            inArray(schema.preorderBatchBook.bookId, bookIds),
          ),
        )
        .for('update');
    }

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

    for (const bookId of bookIds) {
      await resyncOpenBatchBookPricing(tx, batchId, bookId);
    }
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

// 已付款訂單因為梯次還開放中，之後有其他人下單/取消導致團購級距變動，付款
// 當下鎖定的金額可能已經跟「現在」的級距不一樣了（見 lib/batch/tier-diff.ts
// 的說明）。這支不會自己轉帳——工作人員要先在現場把差額實際退給/跟學生
// 收完，再點這裡把訂單品項單價、總金額、payment.amount 同步成目前的級距，
// 並留下稽核紀錄，避免這筆訂單的金額永遠停在付款當下那個已經過期的級距。
// 跟 refundPayment 不同：這裡不改 payment.status／不清空/寫入 refundedAt
// 等欄位——這筆付款本身仍然是「已收款」，只是金額被重新核對，不是退掉
// 整筆付款改回未付款。
export async function settleTierDiff(
  preorderId: string,
  batchId: string,
): Promise<{ error: string } | { diff: number }> {
  const session = await requireBatchStaffAccess(batchId);

  const order = await loadOrderInBatch(preorderId, batchId);
  if (!order) return { error: '找不到此訂單' };
  if (order.paymentStatus !== 'paid') return { error: '此訂單尚未付款' };
  if (order.cancelledAt) return { error: '此訂單已取消' };

  const payment = order.payments.find((p) => p.status === 'succeeded');
  if (!payment) return { error: '找不到此訂單的付款紀錄' };

  const bookIds = [...new Set(order.items.map((item) => item.bookId))];

  type SettleTxResult =
    | { error: string }
    | { oldTotal: number; newTotal: number };

  const result = await db.transaction(async (tx): Promise<SettleTxResult> => {
    // 跟其他會動到 preorderBatchBook 累積數量計算的動作同一套鎖法，避免
    // 這裡讀到的級距跟同時間別人下單/取消造成的中間狀態不一致。
    if (bookIds.length > 0) {
      await tx
        .select({ id: schema.preorderBatchBook.id })
        .from(schema.preorderBatchBook)
        .where(
          and(
            eq(schema.preorderBatchBook.batchId, batchId),
            inArray(schema.preorderBatchBook.bookId, bookIds),
          ),
        )
        .for('update');
    }

    const [batch] = await tx
      .select({ status: schema.preorderBatch.status })
      .from(schema.preorderBatch)
      .where(eq(schema.preorderBatch.id, batchId))
      .limit(1);
    if (!batch || batch.status !== 'open') {
      return { error: '梯次已關閉，金額不會再變動，不需要調整' };
    }

    const batchBooks = await tx.query.preorderBatchBook.findMany({
      where: and(
        eq(schema.preorderBatchBook.batchId, batchId),
        inArray(schema.preorderBatchBook.bookId, bookIds),
      ),
      with: { priceTiers: true },
    });
    const tiersByBookId = new Map(
      batchBooks.map((b) => [b.bookId, b.priceTiers]),
    );
    const cumulative = await getCumulativeQuantities(batchId, tx);

    let newTotal = 0;
    const updates: { id: string; unitPrice: number; subtotal: number }[] = [];
    for (const item of order.items) {
      const tiers = tiersByBookId.get(item.bookId);
      const currentUnitPrice = tiers
        ? resolveTierPrice(tiers, cumulative.get(item.bookId) ?? 0)
        : null;
      const unitPrice = currentUnitPrice ?? item.unitPrice;
      const subtotal = unitPrice * item.quantity;
      newTotal += subtotal;
      if (unitPrice !== item.unitPrice) {
        updates.push({ id: item.id, unitPrice, subtotal });
      }
    }

    if (updates.length === 0) {
      return { error: '金額目前沒有落差，不需要調整' };
    }

    for (const update of updates) {
      await tx
        .update(schema.preorderItem)
        .set({ unitPrice: update.unitPrice, subtotal: update.subtotal })
        .where(eq(schema.preorderItem.id, update.id));
    }
    await tx
      .update(schema.preorder)
      .set({ totalAmount: newTotal })
      .where(eq(schema.preorder.id, preorderId));
    await tx
      .update(schema.payment)
      .set({ amount: newTotal })
      .where(eq(schema.payment.id, payment.id));

    return { oldTotal: order.totalAmount, newTotal };
  });

  if ('error' in result) return { error: result.error };

  const diff = result.newTotal - result.oldTotal;
  await writeAuditLog({
    actorId: session.user.id,
    action: 'payment.tier_settled',
    entityType: 'payment',
    entityId: payment.id,
    before: { amount: result.oldTotal },
    after: { amount: result.newTotal },
    metadata: {
      diff,
      note: diff > 0 ? '確認已收到學生補款' : '確認已退款給學生',
    },
  });

  revalidatePath(`/staff/batches/${batchId}`);
  return { diff };
}
