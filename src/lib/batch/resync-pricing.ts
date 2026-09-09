import 'server-only';

import { and, eq, inArray, isNull } from 'drizzle-orm';

import { db, schema } from '@/db';

import { getCumulativeQuantityForBook } from './batch-catalog';
import { resolveTierPrice } from './pricing';

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// 團購級距浮動計價的核心：把某梯次某本書「還在浮動中」的訂單品項，全部同步
// 成目前累積數量對應的級距價格。
//
// 「浮動中」＝未付款＋未取貨＋未取消——這三個條件本來就是各自獨立的既有欄位
// （見 preorder schema），凍結與否完全由它們組合推導，不需要另外加一個
// is_locked 欄位：已付款/已取貨的訂單自然不會被下面的 where 條件選到，等於
// 當下價格就固定住了；已取消的訂單本來就不計入累積數量。
//
// 只在梯次還「開放中」時才會浮動——這就是「除非截止不然都浮動」的唯一開關。
// 呼叫端（下單/改數量/取消/退款/調整級距……）都必須在自己已經鎖住
// preorderBatchBook 那一列的同一個 transaction 裡呼叫這個函式，確保跟其他
// 同時發生的異動序列化執行，不會用到還沒 commit 的中間狀態算出錯誤價格。
//
// 這裡刻意不寫稽核紀錄：writeAuditLog（src/lib/audit.ts）固定用模組層級的
// `db`，不吃 tx，這個函式的所有寫入都必須留在呼叫端的 transaction 裡才能跟
// 觸發它的那個異動（下單/取消/改級距……）一起 commit/rollback；觸發此次
// 浮動的那個原始動作本身已經有自己的 writeAuditLog 記錄「誰做了什麼」，
// 對每一筆被連帶調整價格的其他訂單再各自補一筆系統稽核紀錄純屬雜訊，
// 不記也不影響追溯性。
export async function resyncOpenBatchBookPricing(
  tx: DbOrTx,
  batchId: string,
  bookId: string,
): Promise<void> {
  const [batch] = await tx
    .select({ status: schema.preorderBatch.status })
    .from(schema.preorderBatch)
    .where(eq(schema.preorderBatch.id, batchId))
    .limit(1);
  if (!batch || batch.status !== 'open') return;

  const batchBook = await tx.query.preorderBatchBook.findFirst({
    where: and(
      eq(schema.preorderBatchBook.batchId, batchId),
      eq(schema.preorderBatchBook.bookId, bookId),
    ),
    with: { priceTiers: true },
  });
  if (!batchBook) return;

  const totalCumulative = await getCumulativeQuantityForBook(
    batchId,
    bookId,
    tx,
  );
  const newUnitPrice = resolveTierPrice(batchBook.priceTiers, totalCumulative);
  if (newUnitPrice === null) return;

  // 浮動中的品項：這本書、這個梯次、訂單未付款＋未取貨＋未取消。
  const items = await tx
    .select({
      id: schema.preorderItem.id,
      preorderId: schema.preorderItem.preorderId,
      quantity: schema.preorderItem.quantity,
      unitPrice: schema.preorderItem.unitPrice,
    })
    .from(schema.preorderItem)
    .innerJoin(
      schema.preorder,
      eq(schema.preorderItem.preorderId, schema.preorder.id),
    )
    .where(
      and(
        eq(schema.preorderItem.batchId, batchId),
        eq(schema.preorderItem.bookId, bookId),
        eq(schema.preorder.paymentStatus, 'unpaid'),
        eq(schema.preorder.pickupStatus, 'pending'),
        isNull(schema.preorder.cancelledAt),
      ),
    );

  const changed = items.filter((item) => item.unitPrice !== newUnitPrice);
  if (changed.length === 0) return;

  for (const item of changed) {
    await tx
      .update(schema.preorderItem)
      .set({
        unitPrice: newUnitPrice,
        subtotal: newUnitPrice * item.quantity,
      })
      .where(eq(schema.preorderItem.id, item.id));
  }

  // 一張單可能橫跨好幾本書，不能只用這本書的差額去加減 totalAmount，要重新
  // 抓該單目前全部品項加總。
  const affectedPreorderIds = [...new Set(changed.map((i) => i.preorderId))];
  const allItems = await tx
    .select({
      preorderId: schema.preorderItem.preorderId,
      subtotal: schema.preorderItem.subtotal,
    })
    .from(schema.preorderItem)
    .where(inArray(schema.preorderItem.preorderId, affectedPreorderIds));

  const totalsByPreorderId = new Map<string, number>();
  for (const row of allItems) {
    totalsByPreorderId.set(
      row.preorderId,
      (totalsByPreorderId.get(row.preorderId) ?? 0) + row.subtotal,
    );
  }
  for (const [preorderId, totalAmount] of totalsByPreorderId) {
    await tx
      .update(schema.preorder)
      .set({ totalAmount })
      .where(eq(schema.preorder.id, preorderId));
    // 待付款的 payment 紀錄（見 createPreorder 併單時的同一個作法）也要跟著
    // 更新，不然浮動中訂單的應收金額只有 preorder.totalAmount 換了，
    // payment.amount 停在建單當下的舊數字，之後 markPaid 沿用既有 pending
    // 那筆時就會凍結在錯誤（過期）的金額。已經是 succeeded/refunded 的
    // 付款紀錄本來就不該再動，where 條件只挑 pending 那筆。
    await tx
      .update(schema.payment)
      .set({ amount: totalAmount })
      .where(
        and(
          eq(schema.payment.preorderId, preorderId),
          eq(schema.payment.status, 'pending'),
        ),
      );
  }
}
