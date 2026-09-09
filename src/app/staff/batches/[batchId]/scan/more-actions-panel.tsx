'use client';

import Link from 'next/link';

import {
  MarkPaymentButton,
  MarkPickupButton,
  RevertPaymentButton,
  RevertPickupButton,
} from '@/components/payment-pickup-actions';

import type { ScannedOrderSummary } from '../actions';

const SOURCE = '掃描核對面板';

export function MoreActionsPanel({
  batchId,
  summary,
  cancelReason,
  onCancelReasonChange,
  pending,
  onError,
  onResolve,
  onRequestCancel,
}: {
  batchId: string;
  summary: ScannedOrderSummary;
  cancelReason: string;
  onCancelReasonChange: (value: string) => void;
  pending: boolean;
  onError: (message: string | null) => void;
  onResolve: (message: string, patch: Partial<ScannedOrderSummary>) => void;
  onRequestCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-black/10 pt-3 dark:border-white/15">
      {!summary.cancelledAt && (
        <div>
          <span className="text-zinc-500">切換狀態：</span>
          <div className="flex flex-wrap items-end text-xs gap-2">
            {summary.paymentStatus === 'paid' ? (
              <RevertPaymentButton
                batchId={batchId}
                preorderId={summary.preorderId}
                totalAmount={summary.totalAmount}
                source={SOURCE}
                description="確定要把這筆訂單的付款狀態撥回未付款嗎？（跟退款走同一套紀錄，會留下稽核軌跡；如果只是掃錯人想改標成別筆，撤銷後可以再重新掃描正確的人。）"
                onReverted={() =>
                  onResolve('已撤銷付款狀態', { paymentStatus: 'unpaid' })
                }
                onError={onError}
              />
            ) : (
              <MarkPaymentButton
                batchId={batchId}
                preorderId={summary.preorderId}
                onMarked={() =>
                  onResolve('已確認付款', { paymentStatus: 'paid' })
                }
                onError={onError}
              />
            )}
            {summary.pickupStatus === 'fulfilled' ? (
              <RevertPickupButton
                batchId={batchId}
                preorderId={summary.preorderId}
                source={SOURCE}
                onReverted={() =>
                  onResolve('已撤銷取貨狀態', { pickupStatus: 'pending' })
                }
                onError={onError}
              />
            ) : (
              <MarkPickupButton
                batchId={batchId}
                preorderId={summary.preorderId}
                paymentStatus={summary.paymentStatus}
                onMarked={() =>
                  onResolve('已確認取貨', { pickupStatus: 'fulfilled' })
                }
                onError={onError}
              />
            )}
          </div>
        </div>
      )}
      {!summary.cancelledAt && summary.pickupStatus === 'pending' ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-1 min-w-40 flex-col gap-1 text-xs">
            取消原因
            <input
              value={cancelReason}
              onChange={(e) => onCancelReasonChange(e.target.value)}
              className="rounded-md border border-black/15 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!cancelReason.trim()) {
                onError('請先填寫取消原因');
                return;
              }
              onError(null);
              onRequestCancel();
            }}
            className="rounded-full border border-red-600/40 px-4 py-1.5 text-xs text-red-600 hover:bg-red-600/10 disabled:opacity-50 dark:text-red-400"
          >
            取消此訂單
          </button>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">此訂單狀態無法在這裡取消。</p>
      )}
      <Link
        href={`/staff/batches/${batchId}/orders/${summary.preorderId}`}
        className="self-start text-xs text-zinc-500 underline"
      >
        查看完整訂單（退款等其他操作）
      </Link>
    </div>
  );
}
