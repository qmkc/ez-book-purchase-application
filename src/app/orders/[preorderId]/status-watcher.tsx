'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { CheckCircleIcon, ExclamationTriangleIcon } from '@/components/icons';
import {
  deriveOrderStatusKey,
  ORDER_STATUS_LABEL,
  type OrderStatusKey,
} from '@/lib/order-status';

import { getOrderStatus } from './actions';

type Snapshot = {
  paymentStatus: 'unpaid' | 'paid';
  pickupStatus: 'pending' | 'fulfilled';
  cancelledAt: string | null;
};

// 還可能被承辦人員推進到下一個狀態，持續輪詢；已取貨/已取消是終點狀態
// （已取貨後即使付款狀態之後又變動，這裡不會再繼續輪詢通知——見
// deriveOrderStatusKey 旁的說明，這是刻意縮小範圍，不是漏掉），
// effect 重新執行時會自然停止。
function isPollable(s: Snapshot) {
  return !s.cancelledAt && s.pickupStatus === 'pending';
}

const POLL_INTERVAL_MS = 10_000;

export function StatusWatcher({
  preorderId,
  initialPaymentStatus,
  initialPickupStatus,
  initialCancelledAt,
}: {
  preorderId: string;
  initialPaymentStatus: 'unpaid' | 'paid';
  initialPickupStatus: 'pending' | 'fulfilled';
  initialCancelledAt: string | null;
}) {
  const router = useRouter();
  const initialSnapshot: Snapshot = {
    paymentStatus: initialPaymentStatus,
    pickupStatus: initialPickupStatus,
    cancelledAt: initialCancelledAt,
  };
  const [current, setCurrent] = useState<Snapshot>(initialSnapshot);
  const [justChangedTo, setJustChangedTo] = useState<OrderStatusKey | null>(
    null,
  );

  // 這幾個 initial* props 在「這個頁面上任何動作造成 router.refresh()」時都
  // 會跟著更新（不是只有這個元件自己的輪詢），例如學生自己按了取消訂單。
  // 這種情況要悄悄同步已知狀態，不能誤判成「剛剛被承辦人員標記」而跳提示——
  // 用 React 官方建議的「render 期間比對並同步」寫法，不用 effect。
  const [synced, setSynced] = useState<Snapshot>(initialSnapshot);
  if (
    initialSnapshot.paymentStatus !== synced.paymentStatus ||
    initialSnapshot.pickupStatus !== synced.pickupStatus ||
    initialSnapshot.cancelledAt !== synced.cancelledAt
  ) {
    setSynced(initialSnapshot);
    setCurrent(initialSnapshot);
  }

  useEffect(() => {
    if (!isPollable(current)) return;

    const interval = setInterval(async () => {
      const result = await getOrderStatus(preorderId);
      if ('error' in result) return;
      const next: Snapshot = {
        paymentStatus: result.paymentStatus,
        pickupStatus: result.pickupStatus,
        cancelledAt: result.cancelledAt
          ? new Date(result.cancelledAt).toISOString()
          : null,
      };
      if (
        next.paymentStatus !== current.paymentStatus ||
        next.pickupStatus !== current.pickupStatus ||
        next.cancelledAt !== current.cancelledAt
      ) {
        setCurrent(next);
        setJustChangedTo(deriveOrderStatusKey(next));
        router.refresh();
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [preorderId, current, router]);

  if (!justChangedTo) return null;

  // 取消不是「完成」，用紅色警示風格；其餘（付款/取貨）才是正向的完成通知。
  const isNegative = justChangedTo === 'cancelled';
  const colorClass = isNegative
    ? 'border-red-600/30 bg-red-600/10 text-red-800 dark:text-red-400'
    : 'border-green-600/30 bg-green-600/10 text-green-800 dark:text-green-400';

  return (
    <div
      className={`mb-6 flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-sm ${colorClass}`}
    >
      <span className="flex items-center gap-1.5">
        {isNegative ? (
          <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
        ) : (
          <CheckCircleIcon className="h-4 w-4 shrink-0" />
        )}
        承辦人員剛剛已將此訂單標記為「{ORDER_STATUS_LABEL[justChangedTo]}」
      </span>
      <button
        type="button"
        onClick={() => setJustChangedTo(null)}
        className="shrink-0 text-xs underline"
      >
        關閉
      </button>
    </div>
  );
}
