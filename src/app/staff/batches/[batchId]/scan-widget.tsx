'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { CheckCircleIcon } from '@/components/icons';
import { OrderStatusChip } from '@/components/order-status-chip';
import { QrCameraScanner } from '@/components/qr-camera-scanner';
import { formatTWD } from '@/lib/format';

import {
  cancelPreorderByStaff,
  lookupOrderByCode,
  markFulfilled,
  markPaid,
  refundPayment,
  unmarkFulfilled,
  type ScannedOrderSummary,
} from './actions';

type Mode = 'payment' | 'pickup';

type PrimaryAction = {
  kind: 'confirm_payment' | 'confirm_pickup' | null;
  label: string;
  disabledText: string;
};

function getPrimaryAction(
  mode: Mode,
  summary: ScannedOrderSummary,
): PrimaryAction {
  if (mode === 'payment') {
    if (summary.cancelledAt) {
      return {
        kind: null,
        label: '',
        disabledText: '此訂單已取消，不需要標記付款。',
      };
    }
    if (summary.paymentStatus === 'unpaid') {
      return { kind: 'confirm_payment', label: '確認已付款', disabledText: '' };
    }
    return {
      kind: null,
      label: '',
      disabledText: '此訂單已付款，不需要再標記一次。',
    };
  }
  if (summary.cancelledAt) {
    return {
      kind: null,
      label: '',
      disabledText: '此訂單已取消，無法標記取貨。',
    };
  }
  if (summary.pickupStatus === 'pending') {
    return { kind: 'confirm_pickup', label: '確認已取貨', disabledText: '' };
  }
  return { kind: null, label: '', disabledText: '此訂單已經標記過取貨了。' };
}

async function playScanFeedback() {
  try {
    navigator.vibrate?.(60);
  } catch {}

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.12);
    oscillator.onended = () => ctx.close();
  } catch {}
}

export function ScanWidget({
  batchId,
  fullscreen = false,
}: {
  batchId: string;

  fullscreen?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('payment');
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(fullscreen);
  const [summary, setSummary] = useState<ScannedOrderSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [awaitingDecision, setAwaitingDecision] = useState(false);
  const [showUnpaidConfirm, setShowUnpaidConfirm] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [pendingRevert, setPendingRevert] = useState<
    'payment' | 'pickup' | null
  >(null);
  // 取貨核對模式下掃到「已經標記過取貨」的訂單——這比「已經標記過付款」風險
  // 高很多（代表可能重複發書，例如有人拿別人的 QR code 截圖來領第二次），
  // 卡片下方一行灰字很容易被忙碌中的工作人員滑過去，所以額外跳出擋住掃描的
  // 警示彈窗，逼工作人員看一眼再決定要不要繼續。
  const [showAlreadyPickedUpAlert, setShowAlreadyPickedUpAlert] =
    useState(false);
  const [pending, startTransition] = useTransition();
  const [scanCount, setScanCount] = useState(0);

  const [autoConfirm, setAutoConfirm] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const autoConfirmedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!scanning) codeInputRef.current?.focus();
  }, [scanning, summary]);

  function lookup(value: string) {
    setError(null);
    setSuccessMessage(null);
    startTransition(async () => {
      const result = await lookupOrderByCode(batchId, value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      playScanFeedback();
      autoConfirmedKeyRef.current = null;
      setSummary(result.summary);
      setCode('');
      setShowUnpaidConfirm(false);
      setShowCancelConfirm(false);
      setPendingRevert(null);
      setMoreOpen(false);
      setCancelReason('');
      const action = getPrimaryAction(mode, result.summary);
      const alreadyPickedUp =
        mode === 'pickup' &&
        !result.summary.cancelledAt &&
        result.summary.pickupStatus === 'fulfilled';
      setShowAlreadyPickedUpAlert(alreadyPickedUp);
      setAwaitingDecision(action.kind !== null || alreadyPickedUp);
    });
  }

  function dismissAlreadyPickedUpAlert() {
    setShowAlreadyPickedUpAlert(false);
    setAwaitingDecision(false);
  }

  function resolveAction(message: string, patch: Partial<ScannedOrderSummary>) {
    setSummary((prev) => (prev ? { ...prev, ...patch } : prev));
    setSuccessMessage(message);
    setError(null);
    setShowUnpaidConfirm(false);
    setShowCancelConfirm(false);
    setShowAlreadyPickedUpAlert(false);
    setPendingRevert(null);
    setMoreOpen(false);
    setCancelReason('');
    setScanCount((n) => n + 1);
    setAwaitingDecision(false);
    router.refresh();
  }

  function confirmPayment() {
    if (!summary) return;
    setError(null);
    startTransition(async () => {
      const result = await markPaid(summary.preorderId, batchId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      resolveAction('已確認付款', { paymentStatus: 'paid' });
    });
  }

  function confirmPickup(allowUnpaid: boolean) {
    if (!summary) return;
    setError(null);
    startTransition(async () => {
      const result = await markFulfilled(
        summary.preorderId,
        batchId,
        '',
        allowUnpaid,
      );
      if (result.needsUnpaidConfirmation) {
        setShowUnpaidConfirm(true);
        return;
      }
      if (result.error) {
        setError(result.error);
        return;
      }
      resolveAction('已確認取貨', { pickupStatus: 'fulfilled' });
    });
  }

  useEffect(() => {
    if (!autoConfirm || !summary || !awaitingDecision) return;

    const action = getPrimaryAction(mode, summary);
    if (!action.kind) return;

    const key = `${summary.preorderId}:${mode}:${action.kind}`;
    if (autoConfirmedKeyRef.current === key) return;
    autoConfirmedKeyRef.current = key;

    if (action.kind === 'confirm_payment')
      startTransition(() => confirmPayment());
    else startTransition(() => confirmPickup(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConfirm, summary, mode, awaitingDecision]);

  function confirmCancel() {
    if (!summary) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelPreorderByStaff(
        summary.preorderId,
        batchId,
        cancelReason,
      );
      if (result?.error) {
        setError(result.error);
        return;
      }
      resolveAction('已取消此訂單', { cancelledAt: new Date().toISOString() });
    });
  }

  function revertPayment() {
    if (!summary) return;
    setError(null);
    startTransition(async () => {
      const result = await refundPayment(
        summary.preorderId,
        batchId,
        summary.totalAmount,
        '掃描核對面板：手動撤銷付款狀態',
      );
      if (result?.error) {
        setError(result.error);
        return;
      }
      resolveAction('已撤銷付款狀態', { paymentStatus: 'unpaid' });
    });
  }

  function revertPickup() {
    if (!summary) return;
    setError(null);
    startTransition(async () => {
      const result = await unmarkFulfilled(
        summary.preorderId,
        batchId,
        '掃描核對面板：手動撤銷取貨狀態',
      );
      if (result?.error) {
        setError(result.error);
        return;
      }
      resolveAction('已撤銷取貨狀態', { pickupStatus: 'pending' });
    });
  }

  const primaryAction = summary ? getPrimaryAction(mode, summary) : null;
  function runPrimaryAction() {
    if (primaryAction?.kind === 'confirm_payment') confirmPayment();
    else if (primaryAction?.kind === 'confirm_pickup') confirmPickup(false);
  }

  return (
    <div
      className={
        fullscreen
          ? ''
          : 'rounded-xl border border-black/10 p-4 dark:border-white/15'
      }
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {(
            [
              { value: 'payment', label: '付款核對' },
              { value: 'pickup', label: '取貨核對' },
            ] as const
          ).map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => {
                setMode(m.value);
                setError(null);
                setSuccessMessage(null);
              }}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                mode === m.value
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-black/15 text-zinc-600 hover:bg-black/4 dark:border-white/20 dark:text-zinc-400 dark:hover:bg-white/6'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {scanCount > 0 && (
            <span className="text-xs text-zinc-500">
              本次已核對 {scanCount} 位
            </span>
          )}
          <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={autoConfirm}
              onChange={(e) => setAutoConfirm(e.target.checked)}
              className="h-3.5 w-3.5 accent-foreground"
            />
            自動確認
          </label>
          {!fullscreen && (
            <Link
              href={`/staff/batches/${batchId}/scan`}
              className="rounded-full border border-black/15 px-3 py-1 text-xs hover:bg-black/4 dark:border-white/20 dark:hover:bg-white/6"
            >
              全螢幕掃描
            </Link>
          )}
          <button
            type="button"
            onClick={() => setScanning((s) => !s)}
            className="rounded-full border border-black/15 px-3 py-1 text-xs hover:bg-black/4 dark:border-white/20 dark:hover:bg-white/6"
          >
            {scanning ? '改用手動輸入' : '使用相機掃描'}
          </button>
        </div>
      </div>

      {scanning ? (
        <QrCameraScanner
          paused={awaitingDecision}
          large={fullscreen}
          onScan={lookup}
          onScanCheck={(text) =>
            /^eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(text)
          }
          onClose={() => setScanning(false)}
        />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            lookup(code);
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="flex flex-1 min-w-48 flex-col gap-1 text-sm">
            輸入/貼上學生出示的代碼
            <input
              ref={codeInputRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              required
              className="rounded-md border border-black/15 bg-transparent px-3 py-2 font-mono text-xs outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {pending ? '核對中…' : '核對代碼'}
          </button>
        </form>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {summary && (
        <div className="mt-3 flex flex-col gap-3 border-t border-black/10 pt-3 dark:border-white/15">
          <div>
            <p className="font-medium">
              {summary.studentName}
              <span className="ml-1 text-xs text-zinc-500">
                {summary.studentEmail}
              </span>
            </p>
            <OrderStatusChip
              paymentStatus={summary.paymentStatus}
              pickupStatus={summary.pickupStatus}
              cancelledAt={summary.cancelledAt}
              className="mt-1"
            />
          </div>
          <ul className="flex flex-col gap-1 text-sm">
            {summary.items.map((item, i) => (
              <li key={i} className="flex items-center justify-between">
                <span>
                  {item.title} × {item.quantity}
                </span>
                <span className="text-zinc-500">
                  {formatTWD(item.unitPrice * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-black/10 pt-2 text-sm dark:border-white/15">
            <span className="text-zinc-500">總金額</span>
            <span className="font-medium">
              {formatTWD(summary.totalAmount)}
            </span>
          </div>

          {successMessage && (
            <p className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
              <CheckCircleIcon className="h-4 w-4 shrink-0" />
              {successMessage}
            </p>
          )}

          {fullscreen ? (
            <div className="flex flex-col gap-2">
              {primaryAction?.kind ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={runPrimaryAction}
                  className="w-full rounded-2xl bg-foreground py-4 text-lg font-semibold text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
                >
                  {pending ? '處理中…' : primaryAction.label}
                </button>
              ) : (
                <p className="text-center text-sm text-zinc-500">
                  {primaryAction?.disabledText}
                </p>
              )}
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                className="self-end text-sm text-zinc-500 underline"
              >
                {moreOpen ? '收起更多操作' : '更多操作…'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {primaryAction?.kind ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={runPrimaryAction}
                  className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
                >
                  {pending ? '處理中…' : primaryAction.label}
                </button>
              ) : (
                <p className="text-sm text-zinc-500">
                  {primaryAction?.disabledText}
                </p>
              )}
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                className="ml-auto text-sm text-zinc-500 underline"
              >
                {moreOpen ? '收起更多操作' : '更多操作…'}
              </button>
            </div>
          )}

          {moreOpen && (
            <div className="flex flex-col gap-2 border-t border-black/10 pt-3 dark:border-white/15">
              {!summary.cancelledAt && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-zinc-500">切換狀態：</span>
                  {summary.paymentStatus === 'paid' ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setPendingRevert('payment')}
                      className="rounded-full border border-orange-600/40 px-3 py-1 text-orange-700 hover:bg-orange-600/10 disabled:opacity-50 dark:text-orange-400"
                    >
                      撤銷已付款
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={confirmPayment}
                      className="rounded-full border border-black/15 px-3 py-1 hover:bg-black/4 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/6"
                    >
                      標記已付款
                    </button>
                  )}
                  {summary.pickupStatus === 'fulfilled' ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setPendingRevert('pickup')}
                      className="rounded-full border border-orange-600/40 px-3 py-1 text-orange-700 hover:bg-orange-600/10 disabled:opacity-50 dark:text-orange-400"
                    >
                      撤銷已取貨
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => confirmPickup(false)}
                      className="rounded-full border border-black/15 px-3 py-1 hover:bg-black/4 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/6"
                    >
                      標記已取貨
                    </button>
                  )}
                </div>
              )}
              {!summary.cancelledAt && summary.pickupStatus === 'pending' ? (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-1 min-w-40 flex-col gap-1 text-xs">
                    取消原因
                    <input
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      className="rounded-md border border-black/15 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
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
                    className="rounded-full border border-red-600/40 px-4 py-1.5 text-xs text-red-600 hover:bg-red-600/10 disabled:opacity-50 dark:text-red-400"
                  >
                    取消此訂單
                  </button>
                </div>
              ) : (
                <p className="text-xs text-zinc-500">
                  此訂單狀態無法在這裡取消。
                </p>
              )}
              <Link
                href={`/staff/batches/${batchId}/orders/${summary.preorderId}`}
                className="self-start text-xs text-zinc-500 underline"
              >
                查看完整訂單（退款等其他操作）
              </Link>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={showAlreadyPickedUpAlert}
        title="⚠️ 這筆訂單已經領過書了"
        description={`${summary?.studentName ?? '這位同學'}的這筆訂單先前已經標記為已取貨，這次掃描不會重複發書。請留意是否有人拿別人的 QR code 截圖來重複領書；如果本人反映還沒拿到書，請點「查看完整訂單」確認紀錄。`}
        confirmLabel="知道了，繼續掃描"
        cancelLabel="查看完整訂單"
        onConfirm={dismissAlreadyPickedUpAlert}
        onCancel={() => {
          if (!summary) return;
          router.push(`/staff/batches/${batchId}/orders/${summary.preorderId}`);
        }}
      />

      <ConfirmDialog
        open={showUnpaidConfirm}
        title="此訂單尚未付款"
        description="此訂單目前狀態是待付款，確定要在還沒收到款項的情況下標記取貨嗎？這個動作會記錄在稽核紀錄中。"
        confirmLabel="仍要標記取貨"
        onConfirm={() => confirmPickup(true)}
        onCancel={() => setShowUnpaidConfirm(false)}
        pending={pending}
      />

      <ConfirmDialog
        open={showCancelConfirm}
        title="取消此訂單"
        description="確定要取消這筆訂單嗎？這個動作會記錄在稽核紀錄中，取消後無法直接復原。"
        confirmLabel="確定取消"
        onConfirm={confirmCancel}
        onCancel={() => setShowCancelConfirm(false)}
        pending={pending}
      />

      <ConfirmDialog
        open={pendingRevert === 'payment'}
        title="撤銷已付款"
        description="確定要把這筆訂單的付款狀態撥回未付款嗎？（跟退款走同一套紀錄，會留下稽核軌跡；如果只是掃錯人想改標成別筆，撤銷後可以再重新掃描正確的人。）"
        confirmLabel="確定撤銷"
        onConfirm={revertPayment}
        onCancel={() => setPendingRevert(null)}
        pending={pending}
      />

      <ConfirmDialog
        open={pendingRevert === 'pickup'}
        title="撤銷已取貨"
        description="確定要把這筆訂單的取貨狀態撥回未取貨嗎？這個動作會記錄在稽核紀錄中。"
        confirmLabel="確定撤銷"
        onConfirm={revertPickup}
        onCancel={() => setPendingRevert(null)}
        pending={pending}
      />
    </div>
  );
}
