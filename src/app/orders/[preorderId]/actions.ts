'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db, schema } from '@/db';
import { writeAuditLog } from '@/lib/audit';
import { getCumulativeQuantities } from '@/lib/batch/batch-catalog';
import { resolveTierPrice } from '@/lib/batch/pricing';
import { deriveOrderStatusKey } from '@/lib/order-status';
import { signPreorderCode } from '@/lib/qr-token';
import { requireSession } from '@/lib/auth/session';

async function loadOwnPreorder(preorderId: string, userId: string) {
  const [preorder] = await db
    .select()
    .from(schema.preorder)
    .where(eq(schema.preorder.id, preorderId))
    .limit(1);
  if (!preorder || preorder.userId !== userId) return null;
  return preorder;
}

// 產生此訂單目前狀態對應的短效 QR 代碼；承辦人員掃到後依訂單目前狀態決定
// 要標記付款還是標記取貨，代碼本身不編碼「要做哪個動作」。
export async function getOrderQrToken(preorderId: string) {
  const session = await requireSession(`/orders/${preorderId}`);
  const preorder = await loadOwnPreorder(preorderId, session.user.id);
  if (!preorder) return { error: '找不到此訂單' };
  if (preorder.cancelledAt) {
    return { error: '此訂單已取消，不需要出示代碼' };
  }
  return { token: await signPreorderCode(preorderId) };
}

// 給學生自己那頁的訂單狀態輪詢用，讓「承辦人員掃碼標記付款/取貨」之後，
// 學生畫面不用手動重新整理就能跳出「已完成」的提示。
export async function getOrderStatus(preorderId: string) {
  const session = await requireSession(`/orders/${preorderId}`);
  const preorder = await loadOwnPreorder(preorderId, session.user.id);
  if (!preorder) return { error: '找不到此訂單' };
  return {
    paymentStatus: preorder.paymentStatus,
    pickupStatus: preorder.pickupStatus,
    cancelledAt: preorder.cancelledAt,
  };
}

// 學生自己調整還沒付款訂單裡各本書的數量（改多改少都可以，改成 0 等於把那本
// 書從訂單移除，但整張單至少要留一項）；價格一律依送出當下的團購級距重新
// 計算，跟建立新訂單/併單同一套規則，不會沿用舊的單價。
export async function updateOrderItemQuantities(
  preorderId: string,
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const session = await requireSession(`/orders/${preorderId}`);
  const preorder = await loadOwnPreorder(preorderId, session.user.id);
  if (!preorder) return { error: '找不到此訂單' };
  if (
    preorder.paymentStatus !== 'unpaid' ||
    preorder.pickupStatus !== 'pending' ||
    preorder.cancelledAt
  ) {
    return { error: '此訂單狀態無法修改' };
  }

  const existingItems = await db
    .select()
    .from(schema.preorderItem)
    .where(eq(schema.preorderItem.preorderId, preorderId));
  if (existingItems.length === 0) return { error: '找不到訂單項目' };

  const newQuantities = new Map<string, number>();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('qty-')) continue;
    const quantity = Number(value);
    if (!Number.isFinite(quantity) || quantity < 0) continue;
    newQuantities.set(key.slice('qty-'.length), Math.floor(quantity));
  }

  const remainingCount = existingItems.filter(
    (item) => (newQuantities.get(item.bookId) ?? item.quantity) > 0,
  ).length;
  if (remainingCount === 0) {
    return { error: '訂單至少需要保留一項書籍，如果不需要了請直接取消訂單' };
  }

  const existingItemBookIds = existingItems.map((item) => item.bookId);

  const result = await db.transaction(async (tx) => {
    // 跟 createPreorder 同一道防線：鎖住這張單牽涉到的書籍列，避免這次調整
    // 數量跟同一梯次其他人的下單/調整同時卡在數量上限臨界點時一起超賣。
    await tx
      .select({ id: schema.preorderBatchBook.id })
      .from(schema.preorderBatchBook)
      .where(
        and(
          eq(schema.preorderBatchBook.batchId, preorder.batchId),
          inArray(schema.preorderBatchBook.bookId, existingItemBookIds),
        ),
      )
      .for('update');

    const batchBooks = await tx.query.preorderBatchBook.findMany({
      where: and(
        eq(schema.preorderBatchBook.batchId, preorder.batchId),
        inArray(schema.preorderBatchBook.bookId, existingItemBookIds),
      ),
      with: { priceTiers: true, book: true },
    });
    const batchBookByBookId = new Map(batchBooks.map((b) => [b.bookId, b]));
    const cumulative = await getCumulativeQuantities(preorder.batchId, tx);

    const toDelete: string[] = [];
    const toUpdate: {
      id: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }[] = [];

    for (const item of existingItems) {
      const requestedQty = newQuantities.has(item.bookId)
        ? newQuantities.get(item.bookId)!
        : item.quantity;
      if (requestedQty === item.quantity) continue;

      if (requestedQty === 0) {
        toDelete.push(item.id);
        continue;
      }

      const batchBook = batchBookByBookId.get(item.bookId);
      if (!batchBook) return { error: '書籍資訊有誤，請重新整理頁面' };

      const cumulativeExcludingThisItem =
        (cumulative.get(item.bookId) ?? 0) - item.quantity;
      const effectiveCumulative = cumulativeExcludingThisItem + requestedQty;
      if (
        batchBook.quantityLimit !== null &&
        effectiveCumulative > batchBook.quantityLimit
      ) {
        return {
          error: `「${batchBook.book.title}」剩餘可預購數量不足，請重新整理頁面確認數量`,
        };
      }
      const unitPrice = resolveTierPrice(
        batchBook.priceTiers,
        effectiveCumulative,
      );
      if (unitPrice === null)
        return { error: '此書尚未設定價格，請聯繫承辦人員' };

      toUpdate.push({
        id: item.id,
        quantity: requestedQty,
        unitPrice,
        subtotal: unitPrice * requestedQty,
      });
    }

    if (toDelete.length === 0 && toUpdate.length === 0) {
      return { error: '沒有任何數量變更' };
    }

    for (const id of toDelete) {
      await tx
        .delete(schema.preorderItem)
        .where(eq(schema.preorderItem.id, id));
    }
    for (const update of toUpdate) {
      await tx
        .update(schema.preorderItem)
        .set({
          quantity: update.quantity,
          unitPrice: update.unitPrice,
          subtotal: update.subtotal,
        })
        .where(eq(schema.preorderItem.id, update.id));
    }

    const remaining = await tx
      .select()
      .from(schema.preorderItem)
      .where(eq(schema.preorderItem.preorderId, preorderId));
    const newTotal = remaining.reduce((sum, item) => sum + item.subtotal, 0);

    await tx
      .update(schema.preorder)
      .set({ totalAmount: newTotal })
      .where(eq(schema.preorder.id, preorderId));
    await tx
      .update(schema.payment)
      .set({ amount: newTotal })
      .where(
        and(
          eq(schema.payment.preorderId, preorderId),
          eq(schema.payment.status, 'pending'),
        ),
      );

    return { toDelete, toUpdate };
  });

  if ('error' in result) return { error: result.error };

  await writeAuditLog({
    actorId: session.user.id,
    action: 'preorder.items_updated',
    entityType: 'preorder',
    entityId: preorderId,
    after: { updated: result.toUpdate, deletedItemIds: result.toDelete },
  });

  revalidatePath(`/orders/${preorderId}`);
  return { success: true };
}

export async function cancelOwnPreorder(preorderId: string) {
  const session = await requireSession(`/orders/${preorderId}`);
  const preorder = await loadOwnPreorder(preorderId, session.user.id);
  if (!preorder) return { error: '找不到此訂單' };
  if (
    preorder.paymentStatus !== 'unpaid' ||
    preorder.pickupStatus !== 'pending' ||
    preorder.cancelledAt
  ) {
    return { error: '此訂單已無法取消' };
  }

  await db
    .update(schema.preorder)
    .set({
      cancelledAt: new Date(),
      cancelledBy: session.user.id,
      cancelReason: '學生自行取消',
    })
    .where(eq(schema.preorder.id, preorderId));

  await writeAuditLog({
    actorId: session.user.id,
    action: 'preorder.cancelled',
    entityType: 'preorder',
    entityId: preorderId,
    before: { status: deriveOrderStatusKey(preorder) },
    after: { status: 'cancelled' },
  });

  revalidatePath(`/orders/${preorderId}`);
  return {};
}
