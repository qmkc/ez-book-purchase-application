import 'server-only';

// 團購級距計價：依「目前累積訂購數量（含本次訂購）」取符合的最高門檻級距。
// tiers 不假設呼叫端已排序。務必確保每個 batchBook 都有 minQuantity = 1
// 的基本級距，否則累積數量不足以達到任何門檻時會找不到適用價格。
export function resolveTierPrice(
  tiers: { minQuantity: number; price: number }[],
  quantityAfterThisOrder: number,
): number | null {
  const applicable = tiers
    .filter((tier) => tier.minQuantity <= quantityAfterThisOrder)
    .sort((a, b) => b.minQuantity - a.minQuantity);
  return applicable.length > 0 ? applicable[0].price : null;
}
