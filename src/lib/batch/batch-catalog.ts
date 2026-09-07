import 'server-only';

import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { db, schema } from '@/db';

// 可傳入 db 或 transaction 內的 tx，讓呼叫端可以在同一個 transaction 裡（鎖住
// 相關列之後）重新讀取一次累積數量，確保跟寫入時看到的是同一份資料，見
// createPreorder/updateOrderItemQuantities 的用法。
type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

// 某梯次每本書「目前累積訂購數量」（不含已取消的訂單），用來決定下一筆訂單
// 適用哪一個團購級距。見 src/db/schema/preorder/preorder.ts 對計價規則的說明。
export async function getCumulativeQuantities(
  batchId: string,
  dbOrTx: DbOrTx = db,
): Promise<Map<string, number>> {
  const rows = await dbOrTx
    .select({
      bookId: schema.preorderItem.bookId,
      total: sql<number>`coalesce(sum(${schema.preorderItem.quantity}), 0)`.mapWith(
        Number,
      ),
    })
    .from(schema.preorderItem)
    .innerJoin(
      schema.preorder,
      eq(schema.preorderItem.preorderId, schema.preorder.id),
    )
    .where(
      and(
        eq(schema.preorderItem.batchId, batchId),
        isNull(schema.preorder.cancelledAt),
      ),
    )
    .groupBy(schema.preorderItem.bookId);

  return new Map(rows.map((row) => [row.bookId, row.total]));
}

// 目前已下單的人數（不含已取消的訂單；同一人併單過還是只算一個人）。
// 給學生端的梯次頁顯示用（增加一點社群感/急迫感），只回傳這一個數字——
// 金額、取貨進度等內部資訊只給 admin/staff 看，見 getBatchStats。
export async function getBatchOrdererCount(batchId: string): Promise<number> {
  const rows = await db
    .selectDistinct({ userId: schema.preorder.userId })
    .from(schema.preorder)
    .where(
      and(
        eq(schema.preorder.batchId, batchId),
        isNull(schema.preorder.cancelledAt),
      ),
    );
  return rows.length;
}

export type BatchStats = {
  // 訂購人數：這個梯次目前有幾個不同的人下單（不含已取消的訂單；同一人
  // 併單過還是只算一個人）。
  studentCount: number;
  activeOrderCount: number;
  cancelledOrderCount: number;
  fulfilledCount: number;
  // 書本總數量：所有品項的數量加總（不含已取消的訂單）。
  totalBookQuantity: number;
  // 總金額＝實收＋未收，都只算未取消的訂單；已取消的訂單本來就不用付款，
  // 不計入這幾個金額統計，避免管理員誤以為那筆錢還要收。
  totalAmount: number;
  receivedAmount: number;
  outstandingAmount: number;
  books: { bookId: string; title: string; quantity: number; subtotal: number }[];
};

// 給管理員/承辦人員看的梯次總覽數字：訂購人數、書本數量（含逐本拆分）、
// 目前實收/未收/總金額。都只統計未取消的訂單——已取消的不用收錢、也不用
// 準備書，混進去算會讓「還缺多少錢」「要跟出版社訂多少本」失真。
export async function getBatchStats(batchId: string): Promise<BatchStats> {
  const orders = await db
    .select({
      userId: schema.preorder.userId,
      paymentStatus: schema.preorder.paymentStatus,
      pickupStatus: schema.preorder.pickupStatus,
      cancelledAt: schema.preorder.cancelledAt,
      totalAmount: schema.preorder.totalAmount,
    })
    .from(schema.preorder)
    .where(eq(schema.preorder.batchId, batchId));

  const active = orders.filter((o) => !o.cancelledAt);
  const cancelledOrderCount = orders.length - active.length;
  const fulfilledCount = active.filter((o) => o.pickupStatus === 'fulfilled').length;
  const totalAmount = active.reduce((sum, o) => sum + o.totalAmount, 0);
  const receivedAmount = active
    .filter((o) => o.paymentStatus === 'paid')
    .reduce((sum, o) => sum + o.totalAmount, 0);

  const bookRows = await db
    .select({
      bookId: schema.preorderItem.bookId,
      title: schema.book.title,
      quantity: sql<number>`coalesce(sum(${schema.preorderItem.quantity}), 0)`.mapWith(Number),
      subtotal: sql<number>`coalesce(sum(${schema.preorderItem.subtotal}), 0)`.mapWith(Number),
    })
    .from(schema.preorderItem)
    .innerJoin(schema.preorder, eq(schema.preorderItem.preorderId, schema.preorder.id))
    .innerJoin(schema.book, eq(schema.preorderItem.bookId, schema.book.id))
    .where(and(eq(schema.preorderItem.batchId, batchId), isNull(schema.preorder.cancelledAt)))
    .groupBy(schema.preorderItem.bookId, schema.book.title)
    .orderBy(asc(schema.book.title));

  return {
    studentCount: new Set(active.map((o) => o.userId)).size,
    activeOrderCount: active.length,
    cancelledOrderCount,
    fulfilledCount,
    totalBookQuantity: bookRows.reduce((sum, b) => sum + b.quantity, 0),
    totalAmount,
    receivedAmount,
    outstandingAmount: totalAmount - receivedAmount,
    books: bookRows,
  };
}

// 某梯次開放預購的書籍（含書籍基本資料與價格級距），只回傳仍上架的品項。
export async function getActiveBatchBooks(batchId: string) {
  const batchBooks = await db.query.preorderBatchBook.findMany({
    where: and(
      eq(schema.preorderBatchBook.batchId, batchId),
      eq(schema.preorderBatchBook.isActive, true),
    ),
    with: {
      book: true,
      priceTiers: { orderBy: asc(schema.preorderBatchBookPriceTier.minQuantity) },
    },
  });
  return batchBooks;
}
