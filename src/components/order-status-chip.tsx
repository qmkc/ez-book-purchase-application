import {
  deriveOrderStatusKey,
  ORDER_STATUS_LABEL,
  type OrderStatusFields,
} from '@/lib/order-status';

// 顏色跟站上其他地方的慣例對齊：取消＝紅、成功／取貨完成＝綠，待處理用琥珀色
// 提醒還沒結束，已付款但還沒取貨用藍色跟兩者區隔開；已取貨但未付款（現場先
// 讓學生取貨、錢晚點再收）另外用橘色標出來，跟正常已取貨的綠色明顯不同，
// 提醒承辦人員這筆還欠款。
const STATUS_STYLE: Record<ReturnType<typeof deriveOrderStatusKey>, string> = {
  pending_payment: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  paid: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  fulfilled: 'bg-green-500/15 text-green-700 dark:text-green-400',
  fulfilled_unpaid: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  cancelled: 'bg-red-500/15 text-red-700 dark:text-red-400',
};

// 訂單狀態的小標籤，統一放在訂單相關的各個列表/詳情頁旁邊，顏色一致。狀態
// 是從 paymentStatus/pickupStatus/cancelledAt 三個獨立欄位推導出來的（見
// deriveOrderStatusKey），不用每個呼叫端各自組合一次判斷式。
export function OrderStatusChip({
  paymentStatus,
  pickupStatus,
  cancelledAt,
  className = '',
}: OrderStatusFields & { className?: string }) {
  const key = deriveOrderStatusKey({
    paymentStatus,
    pickupStatus,
    cancelledAt,
  });

  return (
    <span
      className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLE[key]} ${className}`}
    >
      {ORDER_STATUS_LABEL[key]}
    </span>
  );
}
