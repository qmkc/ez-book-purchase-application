'use client';

import Link from 'next/link';

import { OrderStatusChip } from '@/components/order-status-chip';
import {
  MarkPaymentButton,
  MarkPickupButton,
  RevertPaymentButton,
  RevertPickupButton,
} from '@/components/payment-pickup-actions';
import { formatTWD } from '@/lib/format';

import type { CombinedOrderEntry } from './actions';

const SOURCE = '聯合掃描核對面板';

type ResolvedPatch = Partial<
  Pick<CombinedOrderEntry, 'paymentStatus' | 'pickupStatus'>
>;

// 「聯合掃描」清單裡的單筆訂單卡片：checkbox 決定這筆是否要被下方的批次
// 按鈕一起處理，跟頂部的快捷按鈕（單獨確認/撤銷這一筆的付款、取貨狀態）
// 是兩件獨立的事——快捷按鈕呼叫的是跟單一梯次掃描頁「更多操作」面板共用
// 的同一組按鈕元件，各自內建確認框跟 loading 狀態。
export function CombinedOrderCard({
  order,
  checked,
  onToggleChecked,
  onResolved,
  onError,
}: {
  order: CombinedOrderEntry;
  checked: boolean;
  onToggleChecked: () => void;
  onResolved: (
    preorderId: string,
    patch: ResolvedPatch,
    message: string,
  ) => void;
  onError: (message: string) => void;
}) {
  const cancelled = Boolean(order.cancelledAt);

  return (
    <li className="rounded-lg border border-black/10 p-2.5 dark:border-white/15">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {!cancelled && (
            <input
              type="checkbox"
              checked={checked}
              onChange={onToggleChecked}
              className="h-4 w-4 shrink-0 accent-foreground"
              aria-label={`納入這筆${order.batchName}的訂單`}
            />
          )}
          <span className="font-medium">{order.batchName}</span>
        </div>
        <OrderStatusChip
          paymentStatus={order.paymentStatus}
          pickupStatus={order.pickupStatus}
          cancelledAt={order.cancelledAt}
        />
      </div>

      {!cancelled && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          {order.paymentStatus === 'unpaid' ? (
            <MarkPaymentButton
              batchId={order.batchId}
              preorderId={order.preorderId}
              label="確認付款"
              onMarked={() =>
                onResolved(
                  order.preorderId,
                  { paymentStatus: 'paid' },
                  '已確認付款',
                )
              }
              onError={onError}
            />
          ) : (
            <RevertPaymentButton
              batchId={order.batchId}
              preorderId={order.preorderId}
              totalAmount={order.totalAmount}
              source={SOURCE}
              onReverted={() =>
                onResolved(
                  order.preorderId,
                  { paymentStatus: 'unpaid' },
                  '已撤銷付款',
                )
              }
              onError={onError}
            />
          )}
          {order.pickupStatus === 'pending' ? (
            <MarkPickupButton
              batchId={order.batchId}
              preorderId={order.preorderId}
              paymentStatus={order.paymentStatus}
              label="確認取貨"
              onMarked={() =>
                onResolved(
                  order.preorderId,
                  { pickupStatus: 'fulfilled' },
                  '已確認取貨',
                )
              }
              onError={onError}
            />
          ) : (
            <RevertPickupButton
              batchId={order.batchId}
              preorderId={order.preorderId}
              source={SOURCE}
              onReverted={() =>
                onResolved(
                  order.preorderId,
                  { pickupStatus: 'pending' },
                  '已撤銷取貨',
                )
              }
              onError={onError}
            />
          )}
        </div>
      )}

      <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-zinc-500">
        {order.items.map((item, i) => (
          <li key={i} className="flex items-center justify-between">
            <span>
              {item.title} × {item.quantity}
            </span>
            <span>{formatTWD(item.unitPrice * item.quantity)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex items-center justify-between text-xs">
        <Link
          href={`/staff/batches/${order.batchId}/orders/${order.preorderId}`}
          className="text-zinc-500 underline"
        >
          查看完整訂單
        </Link>
        <span className="font-medium">{formatTWD(order.totalAmount)}</span>
      </div>
    </li>
  );
}
