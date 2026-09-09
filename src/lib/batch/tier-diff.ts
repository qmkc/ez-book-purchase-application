import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';

import { db, schema } from '@/db';

import { getCumulativeQuantities } from './batch-catalog';
import { resolveTierPrice } from './pricing';

export type TierDiffItem = {
  bookId: string;
  quantity: number;
  paidUnitPrice: number;
  currentUnitPrice: number;
};

export type TierDiff = {
  // 只包含單價跟付款當下不同的品項；沒有落差的書不會出現在這裡。
  items: TierDiffItem[];
  // 現在應付總額－已付總額：正值代表要跟學生補收，負值代表要退錢給學生，
  // 0 代表沒有落差（items 也會是空陣列）。
  amount: number;
};

const NO_DIFF: TierDiff = { items: [], amount: 0 };

// 已付款訂單付款當下鎖定的單價，跟「現在」的團購級距價可能因為梯次還開放
// 中、持續有其他人下單/取消而不一樣——見 src/lib/batch/resync-pricing.ts
// 對「浮動中」訂單的說明，這裡是同一套邏輯用在「已付款」訂單上，純粹算給
// 畫面顯示/工作人員決定要不要退款、補款用，不會自己動手改任何資料。
//
// 只有梯次還開放中才算：跟 resyncOpenBatchBookPricing 用的是同一個開關，
// 梯次一旦關閉就不會再有新訂單/取消改變累積數量，落差就此定案，不用再比。
export async function computeTierDiff(
  batchId: string,
  items: { bookId: string; quantity: number; unitPrice: number }[],
): Promise<TierDiff> {
  if (items.length === 0) return NO_DIFF;

  const [batch] = await db
    .select({ status: schema.preorderBatch.status })
    .from(schema.preorderBatch)
    .where(eq(schema.preorderBatch.id, batchId))
    .limit(1);
  if (!batch || batch.status !== 'open') return NO_DIFF;

  const bookIds = [...new Set(items.map((item) => item.bookId))];
  const [batchBooksWithTiers, cumulative] = await Promise.all([
    db.query.preorderBatchBook.findMany({
      where: and(
        eq(schema.preorderBatchBook.batchId, batchId),
        inArray(schema.preorderBatchBook.bookId, bookIds),
      ),
      with: { priceTiers: true },
    }),
    getCumulativeQuantities(batchId),
  ]);
  const tiersByBookId = new Map(
    batchBooksWithTiers.map((b) => [b.bookId, b.priceTiers]),
  );

  const diffItems: TierDiffItem[] = [];
  let amount = 0;
  for (const item of items) {
    const tiers = tiersByBookId.get(item.bookId);
    if (!tiers) continue;
    const currentUnitPrice = resolveTierPrice(
      tiers,
      cumulative.get(item.bookId) ?? 0,
    );
    if (currentUnitPrice === null || currentUnitPrice === item.unitPrice) {
      continue;
    }
    diffItems.push({
      bookId: item.bookId,
      quantity: item.quantity,
      paidUnitPrice: item.unitPrice,
      currentUnitPrice,
    });
    amount += (currentUnitPrice - item.unitPrice) * item.quantity;
  }
  return diffItems.length > 0 ? { items: diffItems, amount } : NO_DIFF;
}
