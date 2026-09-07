'use server';

import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { db, schema } from '@/db';
import { writeAuditLog } from '@/lib/audit';
import { getCumulativeQuantities } from '@/lib/batch/batch-catalog';
import { resolveTierPrice } from '@/lib/batch/pricing';
import { requireSession } from '@/lib/auth/session';

export type CreatePreorderState = {
  error?: string;
  needsConfirmation?: boolean;
  existingOrderId?: string;
  existingOrderTotal?: number;
};

export async function createPreorder(
  batchId: string,
  _prevState: CreatePreorderState | undefined,
  formData: FormData,
): Promise<CreatePreorderState> {
  const session = await requireSession(`/batches/${batchId}`);

  const requested: { bookId: string; quantity: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('qty-')) continue;
    const quantity = Number(value);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    requested.push({
      bookId: key.slice('qty-'.length),
      quantity: Math.floor(quantity),
    });
  }

  if (requested.length === 0) {
    return { error: '請至少選擇一本書籍的數量' };
  }

  const confirmMerge = formData.get('confirmMerge') === '1';

  const [batch] = await db
    .select()
    .from(schema.preorderBatch)
    .where(eq(schema.preorderBatch.id, batchId))
    .limit(1);
  if (!batch || batch.status !== 'open') {
    return { error: '此梯次目前未開放預購' };
  }

  // 同一個人在這個梯次如果已經有一筆完全還沒處理（沒付款、沒取貨、沒取消）
  // 的訂單，先問使用者要不要併單，不要悄悄地另外開一張新單——除非使用者
  // 已經確認過（confirmMerge）。已經付款或已經取貨的訂單金額/明細不能再
  // 悄悄改動，不能當成併單對象。
  const [existingOrder] = await db
    .select()
    .from(schema.preorder)
    .where(
      and(
        eq(schema.preorder.batchId, batchId),
        eq(schema.preorder.userId, session.user.id),
        eq(schema.preorder.paymentStatus, 'unpaid'),
        eq(schema.preorder.pickupStatus, 'pending'),
        isNull(schema.preorder.cancelledAt),
      ),
    )
    .orderBy(desc(schema.preorder.createdAt))
    .limit(1);

  if (existingOrder && !confirmMerge) {
    return {
      needsConfirmation: true,
      existingOrderId: existingOrder.id,
      existingOrderTotal: existingOrder.totalAmount,
    };
  }

  const requestedBookIds = requested.map((r) => r.bookId);

  type OrderItemDraft = {
    bookId: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  };

  type TxOutcome =
    | { error: string }
    | {
        preorderId: string;
        merged: boolean;
        items: OrderItemDraft[];
        totalAmount: number;
      };

  const items: OrderItemDraft[] = [];

  const outcome: TxOutcome = await db.transaction(async (tx) => {
    // 鎖住這個梯次裡本次要動到的書籍列，跟其他同時對同一批書送出訂購/改數量
    // 請求的 transaction 序列化執行——沒有這道鎖，兩個人同時卡在數量上限的
    // 臨界點會各自讀到「加上自己這筆還沒超過上限」而同時通過檢查，一起超賣。
    // 加了鎖之後，後到的 transaction 會等前一個 commit 完才繼續，此時再重新
    // 讀累積數量就會看到前一筆已經算進去的結果。
    if (requestedBookIds.length > 0) {
      await tx
        .select({ id: schema.preorderBatchBook.id })
        .from(schema.preorderBatchBook)
        .where(
          and(
            eq(schema.preorderBatchBook.batchId, batchId),
            inArray(schema.preorderBatchBook.bookId, requestedBookIds),
          ),
        )
        .for('update');
    }

    const batchBooks = await tx.query.preorderBatchBook.findMany({
      where: and(
        eq(schema.preorderBatchBook.batchId, batchId),
        eq(schema.preorderBatchBook.isActive, true),
      ),
      with: { priceTiers: true, book: true },
    });
    const batchBookByBookId = new Map(batchBooks.map((b) => [b.bookId, b]));

    const cumulative = await getCumulativeQuantities(batchId, tx);

    const existingItems = existingOrder
      ? await tx
          .select()
          .from(schema.preorderItem)
          .where(eq(schema.preorderItem.preorderId, existingOrder.id))
      : [];
    const existingItemByBookId = new Map(
      existingItems.map((i) => [i.bookId, i]),
    );

    for (const { bookId, quantity: addQty } of requested) {
      const batchBook = batchBookByBookId.get(bookId);
      if (!batchBook) {
        return { error: '所選書籍不在此梯次開放範圍內，請重新整理頁面' };
      }

      // 併單時這本書可能已經在既有訂單裡有一列了，新數量是「原本 + 這次加的」；
      // 累積數量（決定價格級距、檢查數量上限）本來就已經含這張單原本的數量，
      // 扣掉那筆才不會把同一筆數量算兩次。
      const existingItem = existingItemByBookId.get(bookId);
      const newQuantity = (existingItem?.quantity ?? 0) + addQty;
      const cumulativeExcludingThisItem =
        (cumulative.get(bookId) ?? 0) - (existingItem?.quantity ?? 0);
      const effectiveCumulative = cumulativeExcludingThisItem + newQuantity;

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
      if (unitPrice === null) {
        return { error: '此書尚未設定價格，請聯繫承辦人員' };
      }
      items.push({
        bookId,
        quantity: newQuantity,
        unitPrice,
        subtotal: unitPrice * newQuantity,
      });
    }

    if (existingOrder) {
      for (const item of items) {
        await tx
          .insert(schema.preorderItem)
          .values({
            preorderId: existingOrder.id,
            batchId,
            bookId: item.bookId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
          })
          .onConflictDoUpdate({
            target: [
              schema.preorderItem.preorderId,
              schema.preorderItem.bookId,
            ],
            set: {
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              subtotal: item.subtotal,
            },
          });
      }

      const allItems = await tx
        .select()
        .from(schema.preorderItem)
        .where(eq(schema.preorderItem.preorderId, existingOrder.id));
      const newTotal = allItems.reduce((sum, item) => sum + item.subtotal, 0);

      await tx
        .update(schema.preorder)
        .set({ totalAmount: newTotal })
        .where(eq(schema.preorder.id, existingOrder.id));
      await tx
        .update(schema.payment)
        .set({ amount: newTotal })
        .where(
          and(
            eq(schema.payment.preorderId, existingOrder.id),
            eq(schema.payment.status, 'pending'),
          ),
        );

      return {
        preorderId: existingOrder.id,
        merged: true,
        items,
        totalAmount: newTotal,
      };
    }

    const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

    const [preorder] = await tx
      .insert(schema.preorder)
      .values({
        batchId,
        userId: session.user.id,
        totalAmount,
      })
      .returning({ id: schema.preorder.id });

    await tx.insert(schema.preorderItem).values(
      items.map((item) => ({
        preorderId: preorder.id,
        batchId,
        bookId: item.bookId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
      })),
    );

    // 預先建一筆待付款的 payment 紀錄，承辦人員標記付款時更新這筆而不是
    // 另外新增，讓每筆訂單的付款軌跡從一開始就有紀錄可查。
    await tx.insert(schema.payment).values({
      preorderId: preorder.id,
      amount: totalAmount,
      status: 'pending',
    });

    return { preorderId: preorder.id, merged: false, items, totalAmount };
  });

  if ('error' in outcome) return { error: outcome.error };

  await writeAuditLog({
    actorId: session.user.id,
    action: outcome.merged ? 'preorder.merged' : 'preorder.created',
    entityType: 'preorder',
    entityId: outcome.preorderId,
    after: outcome.merged
      ? { batchId, addedItems: outcome.items }
      : { batchId, totalAmount: outcome.totalAmount, items: outcome.items },
  });

  redirect(`/orders/${outcome.preorderId}`);
}
