'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import {
  MarkPaymentButton,
  MarkPickupButton,
  RevertPaymentButton,
  RevertPickupButton,
} from '@/components/payment-pickup-actions';
import { formatTWD } from '@/lib/format';

import {
  cancelPreorderByStaff,
  refundPayment,
  settleTierDiff,
} from '../../actions';

const SOURCE = '訂單詳情頁';

export function OrderActions({
  batchId,
  preorderId,
  paymentStatus,
  pickupStatus,
  cancelledAt,
  totalAmount,
  tierDiffAmount,
}: {
  batchId: string;
  preorderId: string;
  paymentStatus: 'unpaid' | 'paid';
  pickupStatus: 'pending' | 'fulfilled';
  cancelledAt: Date | string | null;
  totalAmount: number;
  tierDiffAmount: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pickupLocation, setPickupLocation] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [refundAmount, setRefundAmount] = useState(totalAmount);
  const [refundReason, setRefundReason] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showRefundConfirm, setShowRefundConfirm] = useState(false);
  const [showSettleConfirm, setShowSettleConfirm] = useState(false);

  const isCancelled = !!cancelledAt;

  function run(
    action: () => Promise<{ error?: string; diff?: number } | undefined>,
    onSuccess?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) {
        setError(result.error);
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  }

  // 這幾個都是「把已經推進的狀態撥回去」的強制切換，跟正常操作流程（標記
  // 付款/取貨、正常取消）分開放在「進階操作」裡，且一律要求二次確認——
  // 例如掃錯人、資料key錯，或是要修正之前誤標的狀態時才會用到，屬於比較
  // 敏感、不常用的操作。
  const showAdvanced =
    !isCancelled && (paymentStatus === 'paid' || pickupStatus === 'fulfilled');

  return (
    <div className="flex flex-col gap-4">
      {/* 標記付款：只看付款狀態，跟取貨狀態無關——即使書已經交出去了（現場
          先讓學生取貨、錢晚點才收），之後補收到錢時一樣可以在這裡補標。 */}
      {!isCancelled && paymentStatus === 'unpaid' && (
        <MarkPaymentButton
          batchId={batchId}
          preorderId={preorderId}
          variant="primary"
          className="self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          onMarked={() => router.refresh()}
          onError={setError}
        />
      )}

      {/* 團購級距在梯次還開放中持續浮動，付款當下鎖定的金額可能已經跟現在
          不同了——這裡不自動轉帳，只負責把「現場已經實際退/收完差額」這件
          事同步回資料庫，見 settleTierDiff 的說明。 */}
      {!isCancelled && paymentStatus === 'paid' && tierDiffAmount !== 0 && (
        <button
          type="button"
          disabled={pending}
          onClick={() => setShowSettleConfirm(true)}
          className="self-start rounded-full border border-amber-600/40 px-4 py-2 text-sm text-amber-700 hover:bg-amber-600/10 disabled:opacity-50 dark:text-amber-400"
        >
          {tierDiffAmount > 0
            ? `確認已收補款 ${formatTWD(tierDiffAmount)}`
            : `確認已退款 ${formatTWD(-tierDiffAmount)}`}
        </button>
      )}

      {!isCancelled && pickupStatus === 'pending' && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            取貨地點（選填）
            <input
              value={pickupLocation}
              onChange={(e) => setPickupLocation(e.target.value)}
              className="w-56 rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
            />
          </label>
          <MarkPickupButton
            batchId={batchId}
            preorderId={preorderId}
            paymentStatus={paymentStatus}
            pickupLocation={pickupLocation}
            variant="primary"
            unpaidLabel="尚未付款，仍要標記取貨"
            onMarked={() => router.refresh()}
            onError={setError}
          />
        </div>
      )}

      {!isCancelled && pickupStatus === 'pending' && (
        <div className="flex flex-wrap items-end gap-2 border-t border-black/10 pt-4 dark:border-white/15">
          <label className="flex flex-col gap-1 text-sm">
            取消原因
            <input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-56 rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
            />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!cancelReason.trim()) {
                setError('請先填寫取消原因');
                return;
              }
              setError(null);
              setShowCancelConfirm(true);
            }}
            className="rounded-full border border-red-600/40 px-4 py-2 text-sm text-red-600 hover:bg-red-600/10 disabled:opacity-50 dark:text-red-400"
          >
            取消訂單
          </button>
        </div>
      )}

      {showAdvanced && (
        <div className="border-t border-black/10 pt-4 dark:border-white/15">
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            className="text-sm text-zinc-500 underline"
          >
            {moreOpen ? '收起進階操作' : '進階操作…'}
          </button>

          {moreOpen && (
            <div className="mt-3 flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-zinc-500">強制切換狀態：</span>
                {paymentStatus === 'paid' && (
                  <RevertPaymentButton
                    batchId={batchId}
                    preorderId={preorderId}
                    totalAmount={totalAmount}
                    source={SOURCE}
                    onReverted={() => router.refresh()}
                    onError={setError}
                  />
                )}
                {pickupStatus === 'fulfilled' && (
                  <RevertPickupButton
                    batchId={batchId}
                    preorderId={preorderId}
                    source={SOURCE}
                    onReverted={() => router.refresh()}
                    onError={setError}
                  />
                )}
              </div>

              {paymentStatus === 'paid' && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1 text-sm">
                    退款金額
                    <input
                      type="number"
                      min={1}
                      max={totalAmount}
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(Number(e.target.value))}
                      className="w-32 rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    退款原因
                    <input
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      className="w-56 rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (!refundReason.trim()) {
                        setError('請先填寫退款原因');
                        return;
                      }
                      if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
                        setError('退款金額需大於 0');
                        return;
                      }
                      setError(null);
                      setShowRefundConfirm(true);
                    }}
                    className="rounded-full border border-black/15 px-4 py-2 text-sm hover:bg-black/4 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/6"
                  >
                    辦理退款
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <ConfirmDialog
        open={showCancelConfirm}
        title="取消此訂單"
        description="確定要取消這筆訂單嗎？這個動作會記錄在稽核紀錄中，取消後無法直接復原。"
        confirmLabel="確定取消"
        onConfirm={() =>
          run(
            () => cancelPreorderByStaff(preorderId, batchId, cancelReason),
            () => setShowCancelConfirm(false),
          )
        }
        onCancel={() => setShowCancelConfirm(false)}
        pending={pending}
      />

      <ConfirmDialog
        open={showRefundConfirm}
        title="辦理退款"
        description={`確定要退款 ${refundReason ? `（原因：${refundReason}）` : ''}嗎？退款後這筆訂單的付款狀態會改回未付款，這個動作會記錄在稽核紀錄中。`}
        confirmLabel="確定退款"
        onConfirm={() =>
          run(
            () =>
              refundPayment(preorderId, batchId, refundAmount, refundReason),
            () => setShowRefundConfirm(false),
          )
        }
        onCancel={() => setShowRefundConfirm(false)}
        pending={pending}
      />

      <ConfirmDialog
        open={showSettleConfirm}
        title={tierDiffAmount > 0 ? '確認已收補款' : '確認已退款'}
        description={
          tierDiffAmount > 0
            ? `請先在現場實際跟學生收取 ${formatTWD(tierDiffAmount)}，收到後再按確認——這裡只負責把訂單金額同步成目前的團購級距，不會自動跟學生收款。這個動作會記錄在稽核紀錄中。`
            : `請先在現場實際退還學生 ${formatTWD(-tierDiffAmount)}，退完後再按確認——這裡只負責把訂單金額同步成目前的團購級距，不會自動幫忙轉帳。這個動作會記錄在稽核紀錄中。`
        }
        confirmLabel="確認並同步金額"
        onConfirm={() =>
          run(
            () => settleTierDiff(preorderId, batchId),
            () => setShowSettleConfirm(false),
          )
        }
        onCancel={() => setShowSettleConfirm(false)}
        pending={pending}
      />
    </div>
  );
}
