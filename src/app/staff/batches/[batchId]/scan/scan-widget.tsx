'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { CheckCircleIcon } from '@/components/icons';
import { OrderStatusChip } from '@/components/order-status-chip';
import { QrCameraScanner } from '@/components/qr-camera-scanner';
import { RosterStatusBadge } from '@/components/roster-status-badge';
import { formatTWD } from '@/lib/format';

import {
  cancelPreorderByStaff,
  lookupOrderByCode,
  markFulfilled,
  markPaid,
  type ScannedOrderSummary,
} from '../actions';
import { MoreActionsPanel } from './more-actions-panel';

type Mode = 'payment' | 'pickup';

type PrimaryAction = {
  kind:
    | 'alert:already_cancelled'
    | 'alert:already_paid'
    | 'alert:already_picked_up'
    | 'confirm:payment'
    | 'confirm:pickup';
  text: string;
};

function getPrimaryAction(
  mode: Mode,
  summary: ScannedOrderSummary,
): PrimaryAction {
  if (summary.cancelledAt) {
    return {
      kind: 'alert:already_cancelled',
      text: '此訂單已取消，無法處理。',
    };
  }

  if (mode === 'payment') {
    if (summary.paymentStatus === 'unpaid') {
      return { kind: 'confirm:payment', text: '確認已付款' };
    }

    // summary.paymentStatus === 'paid'
    return {
      kind: 'alert:already_paid',
      text: '此訂單已付款，不需要再標記一次。',
    };
  }

  if (summary.pickupStatus === 'pending') {
    return { kind: 'confirm:pickup', text: '確認已取貨' };
  }

  // summary.pickupStatus === 'fulfilled'
  return {
    kind: 'alert:already_picked_up',
    text: '此訂單已取貨，不需要再標記一次。',
  };
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

export function ScanWidget({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('payment');
  const [summary, setSummary] = useState<ScannedOrderSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [primaryAction, setPrimaryAction] = useState<PrimaryAction | null>(
    null,
  );
  const [showUnpaidConfirm, setShowUnpaidConfirm] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [pending, startTransition] = useTransition();

  const [autoConfirm, setAutoConfirm] = useState(true);

  const autoConfirmedKeyRef = useRef<string | null>(null);

  const clearPrimaryAction = () => setPrimaryAction(null);

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
      setPrimaryAction(getPrimaryAction(mode, result.summary));
      setShowUnpaidConfirm(false);
      setShowCancelConfirm(false);
      setMoreOpen(false);
      setCancelReason('');
    });
  }

  function resolveAction(message: string, patch: Partial<ScannedOrderSummary>) {
    setSummary((prev) => (prev ? { ...prev, ...patch } : prev));
    setPrimaryAction(null);
    setSuccessMessage(message);
    setError(null);
    setShowUnpaidConfirm(false);
    setShowCancelConfirm(false);
    setMoreOpen(false);
    setCancelReason('');
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

  useEffect(() => {
    if (!autoConfirm || !summary) return;
    if (
      primaryAction?.kind !== 'confirm:payment' &&
      primaryAction?.kind !== 'confirm:pickup'
    ) {
      return;
    }

    const key = `${summary.preorderId}:${mode}:${primaryAction.kind}`;
    if (autoConfirmedKeyRef.current === key) return;
    autoConfirmedKeyRef.current = key;

    if (primaryAction.kind === 'confirm:payment') {
      startTransition(() => confirmPayment());
    } else if (primaryAction.kind === 'confirm:pickup') {
      startTransition(() => confirmPickup(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConfirm, summary, mode, primaryAction]);

  function runPrimaryAction() {
    if (primaryAction?.kind === 'confirm:payment') confirmPayment();
    else if (primaryAction?.kind === 'confirm:pickup') confirmPickup(false);
  }

  return (
    <div className="max-w-2xl mx-auto">
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
                // if (summary)
                //   setPrimaryAction(getPrimaryAction(m.value, summary));
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
          <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={autoConfirm}
              onChange={(e) => setAutoConfirm(e.target.checked)}
              className="h-3.5 w-3.5 accent-foreground"
            />
            自動確認
          </label>
        </div>
      </div>

      <QrCameraScanner
        paused={primaryAction !== null}
        large
        onScan={lookup}
        onScanCheck={(text) =>
          /^eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(text)
        }
        onClose={() => router.push(`/staff/batches/${batchId}`)}
      />

      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {summary && (
        <div className="max-w-4xl mt-3 flex flex-col gap-3 border-t border-black/10 pt-3 dark:border-white/15">
          <div>
            <p className="font-medium">
              {summary.studentName}
              <span className="ml-1 text-xs text-zinc-500">
                {summary.studentEmail}
              </span>
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <OrderStatusChip
                paymentStatus={summary.paymentStatus}
                pickupStatus={summary.pickupStatus}
                cancelledAt={summary.cancelledAt}
              />
              <RosterStatusBadge
                studentId={summary.studentId}
                verificationStatus={summary.rosterVerificationStatus}
              />
            </div>
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

          <div className="flex flex-col gap-2">
            {primaryAction &&
              (primaryAction.kind === 'confirm:payment' ||
              primaryAction.kind === 'confirm:pickup' ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={runPrimaryAction}
                  className="w-full rounded-2xl bg-foreground py-4 text-lg font-semibold text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
                >
                  {pending ? '處理中…' : primaryAction.text}
                </button>
              ) : (
                <p className="text-center text-sm text-zinc-500">
                  {primaryAction.text}
                </p>
              ))}
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              className="self-end text-sm text-zinc-500 underline"
            >
              {moreOpen ? '收起更多操作' : '更多操作…'}
            </button>
          </div>

          {moreOpen && (
            <MoreActionsPanel
              batchId={batchId}
              summary={summary}
              cancelReason={cancelReason}
              onCancelReasonChange={setCancelReason}
              pending={pending}
              onError={setError}
              onResolve={resolveAction}
              onRequestCancel={() => setShowCancelConfirm(true)}
            />
          )}
        </div>
      )}

      <ConfirmDialog
        open={primaryAction?.kind === 'alert:already_picked_up'}
        title="⚠️ 這筆訂單已經領過書了"
        description={`${summary?.studentName ?? '這位同學'}的這筆訂單先前已經標記為已取貨，這次掃描不會重複發書。請留意是否有人拿別人的 QR code 截圖來重複領書；如果本人反映還沒拿到書，請點「查看完整訂單」確認紀錄。`}
        confirmLabel="知道了，繼續掃描"
        cancelLabel="查看完整訂單"
        onConfirm={clearPrimaryAction}
        onCancel={() => {
          if (!summary) return;
          router.push(`/staff/batches/${batchId}/orders/${summary.preorderId}`);
        }}
        onOutsideClick={clearPrimaryAction}
      />

      <ConfirmDialog
        open={primaryAction?.kind === 'alert:already_cancelled'}
        title="⚠️ 這筆訂單已經取消了"
        description={`${summary?.studentName ?? '這位同學'}的這筆訂單先前已經被取消，這次掃描不會重複發書。請留意是否有人拿別人的 QR code 截圖來重複領書；如果本人反映還沒拿到書，請點「查看完整訂單」確認紀錄。`}
        confirmLabel="知道了，繼續掃描"
        cancelLabel="查看完整訂單"
        onConfirm={clearPrimaryAction}
        onCancel={() => {
          if (!summary) return;
          router.push(`/staff/batches/${batchId}/orders/${summary.preorderId}`);
        }}
        onOutsideClick={clearPrimaryAction}
      />

      <ConfirmDialog
        open={primaryAction?.kind === 'alert:already_paid'}
        title="⚠️ 這筆訂單已經付款了"
        description={`${summary?.studentName ?? '這位同學'}的這筆訂單先前已經被標記為已付款，這次掃描不會重複收款。請留意是否有人拿別人的 QR code 截圖來重複領書；如果本人反映還沒付款，請點「查看完整訂單」確認紀錄。`}
        confirmLabel="知道了，繼續掃描"
        cancelLabel="查看完整訂單"
        onConfirm={clearPrimaryAction}
        onCancel={() => {
          if (!summary) return;
          router.push(`/staff/batches/${batchId}/orders/${summary.preorderId}`);
        }}
        onOutsideClick={clearPrimaryAction}
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
    </div>
  );
}
