// 訂單的「顯示用狀態」是從三個獨立欄位推導出來的：paymentStatus（有沒有收
// 到錢）、pickupStatus（書有沒有交出去）、cancelledAt（是否取消，取消跟前
// 兩者互斥於「已取貨」，見 schema 的 check constraint）。這支是唯一一處組合
// 邏輯，畫面上任何要顯示/篩選訂單狀態的地方都呼叫這支，不要各自重新判斷一次
// 條件式，才不會每個地方對「已取貨但未付款」這種組合各自寫出不一致的判斷。
export type OrderStatusFields = {
  paymentStatus: 'unpaid' | 'paid';
  pickupStatus: 'pending' | 'fulfilled';
  cancelledAt: Date | string | null;
};

export type OrderStatusKey =
  | 'cancelled'
  | 'fulfilled'
  | 'fulfilled_unpaid'
  | 'paid'
  | 'pending_payment';

export function deriveOrderStatusKey(order: OrderStatusFields): OrderStatusKey {
  if (order.cancelledAt) return 'cancelled';
  if (order.pickupStatus === 'fulfilled') {
    return order.paymentStatus === 'paid' ? 'fulfilled' : 'fulfilled_unpaid';
  }
  return order.paymentStatus === 'paid' ? 'paid' : 'pending_payment';
}

export const ORDER_STATUS_LABEL: Record<OrderStatusKey, string> = {
  pending_payment: '待付款',
  paid: '已付款',
  fulfilled: '已取貨',
  fulfilled_unpaid: '已取貨（未付款）',
  cancelled: '已取消',
};
