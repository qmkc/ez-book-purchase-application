'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { CheckCircleIcon } from '@/components/icons';
import { OrderStatusChip } from '@/components/order-status-chip';
import { QrCameraScanner } from '@/components/qr-camera-scanner';
import { RosterStatusBadge } from '@/components/roster-status-badge';
import { formatTWD } from '@/lib/format';
import { playScanFeedback } from '@/lib/scan-feedback';

import {
  lookupCombinedOrderByCode,
  markFulfilledCombined,
  markPaidCombined,
  type CombinedScanSummary,
  type ScannableBatch,
} from './actions';

type Mode = 'payment' | 'pickup';

const BATCH_STATUS_LABEL: Record<ScannableBatch['status'], string> = {
  draft: '草稿',
  open: '開放中',
  closed: '已結束',
};

type PrimaryAction =
  | {
      kind: 'confirm:payment' | 'confirm:pickup';
      text: string;
      preorderIds: string[];
    }
  | { kind: 'alert:nothing_to_do'; text: string };

// 跟單一梯次的 getPrimaryAction（batches/[batchId]/scan/scan-widget.tsx）
// 邏輯對稱，差別是這裡要看「所選梯次範圍內的所有訂單」而不是單一一筆——
// 只要還有任何一筆是「未取消且待處理」的就給出可一次合併確認的動作，
// 金額/筆數都是加總後的結果。
function getPrimaryAction(mode: Mode, summary: CombinedScanSummary): PrimaryAction {
  if (mode === 'payment') {
    const actionable = summary.orders.filter(
      (order) => !order.cancelledAt && order.paymentStatus === 'unpaid',
    );
    if (actionable.length > 0) {
      return {
        kind: 'confirm:payment',
        text: `確認已付款（${actionable.length} 筆・合計 ${formatTWD(
          summary.unpaidTotalAmount,
        )}）`,
        preorderIds: actionable.map((order) => order.preorderId),
      };
    }
    const allCancelled = summary.orders.every((order) => order.cancelledAt);
    return {
      kind: 'alert:nothing_to_do',
      text: allCancelled
        ? '此學生在所選梯次的訂單皆已取消，無法收款。'
        : '此學生在所選梯次的訂單皆已付款，不需要再收一次。',
    };
  }

  const actionable = summary.orders.filter(
    (order) => !order.cancelledAt && order.pickupStatus === 'pending',
  );
  if (actionable.length > 0) {
    return {
      kind: 'confirm:pickup',
      text: `確認已取貨（${actionable.length} 筆）`,
      preorderIds: actionable.map((order) => order.preorderId),
    };
  }
  const allCancelled = summary.orders.every((order) => order.cancelledAt);
  return {
    kind: 'alert:nothing_to_do',
    text: allCancelled
      ? '此學生在所選梯次的訂單皆已取消，無法取貨。'
      : '此學生在所選梯次的訂單皆已取貨，不需要再標記一次。',
  };
}

function BatchPicker({
  batches,
  selectedBatchIds,
  onChange,
}: {
  batches: ScannableBatch[];
  selectedBatchIds: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(
      selectedBatchIds.includes(id)
        ? selectedBatchIds.filter((existing) => existing !== id)
        : [...selectedBatchIds, id],
    );
  }

  return (
    <div className="mb-3 flex flex-col gap-2 rounded-xl border border-black/10 p-3 dark:border-white/15">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          合併範圍 {selectedBatchIds.length > 0 && `（已選 ${selectedBatchIds.length} 個梯次）`}
        </p>
        <div className="flex gap-2 text-xs text-zinc-500">
          <button
            type="button"
            onClick={() => onChange(batches.map((b) => b.id))}
            className="underline hover:text-foreground"
          >
            全選
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className="underline hover:text-foreground"
          >
            清空
          </button>
        </div>
      </div>
      {batches.length === 0 ? (
        <p className="text-sm text-zinc-500">目前沒有您可以承辦的梯次。</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {batches.map((batch) => {
            const selected = selectedBatchIds.includes(batch.id);
            return (
              <button
                key={batch.id}
                type="button"
                onClick={() => toggle(batch.id)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  selected
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-black/15 text-zinc-600 hover:bg-black/4 dark:border-white/20 dark:text-zinc-400 dark:hover:bg-white/6'
                }`}
              >
                {batch.name}
                <span className="ml-1 opacity-60">
                  {BATCH_STATUS_LABEL[batch.status]}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ScanWidget({ batches }: { batches: ScannableBatch[] }) {
  const router = useRouter();
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>(
    batches.filter((b) => b.status === 'open').map((b) => b.id),
  );
  const [mode, setMode] = useState<Mode>('payment');
  const [summary, setSummary] = useState<CombinedScanSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [primaryAction, setPrimaryAction] = useState<PrimaryAction | null>(
    null,
  );
  const [showUnpaidConfirm, setShowUnpaidConfirm] = useState(false);
  const [unpaidBatchNames, setUnpaidBatchNames] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  const [autoConfirm, setAutoConfirm] = useState(true);

  const autoConfirmedKeyRef = useRef<string | null>(null);

  const clearPrimaryAction = () => setPrimaryAction(null);

  function lookup(value: string) {
    setError(null);
    setSuccessMessage(null);
    startTransition(async () => {
      const result = await lookupCombinedOrderByCode(selectedBatchIds, value);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      playScanFeedback();
      autoConfirmedKeyRef.current = null;
      setSummary(result.summary);
      setPrimaryAction(getPrimaryAction(mode, result.summary));
      setShowUnpaidConfirm(false);
      setUnpaidBatchNames([]);
    });
  }

  function resolveAction(
    message: string,
    preorderIds: string[],
    patch: Partial<Pick<CombinedScanSummary['orders'][number], 'paymentStatus' | 'pickupStatus'>>,
  ) {
    setSummary((prev) =>
      prev
        ? {
            ...prev,
            orders: prev.orders.map((order) =>
              preorderIds.includes(order.preorderId)
                ? { ...order, ...patch }
                : order,
            ),
          }
        : prev,
    );
    setPrimaryAction(null);
    setSuccessMessage(message);
    setError(null);
    setShowUnpaidConfirm(false);
    setUnpaidBatchNames([]);
    router.refresh();
  }

  function confirmPayment(preorderIds: string[]) {
    setError(null);
    startTransition(async () => {
      const result = await markPaidCombined(preorderIds);
      if (result?.error) {
        setError(result.error);
        return;
      }
      resolveAction('已確認付款', preorderIds, { paymentStatus: 'paid' });
    });
  }

  function confirmPickup(preorderIds: string[], allowUnpaid: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await markFulfilledCombined(preorderIds, allowUnpaid);
      if (result.unpaidBatchNames && result.unpaidBatchNames.length > 0) {
        setUnpaidBatchNames(result.unpaidBatchNames);
        setShowUnpaidConfirm(true);
        return;
      }
      if (result.error) {
        setError(result.error);
        return;
      }
      resolveAction('已確認取貨', preorderIds, { pickupStatus: 'fulfilled' });
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

    const key = `${primaryAction.kind}:${primaryAction.preorderIds.slice().sort().join(',')}`;
    if (autoConfirmedKeyRef.current === key) return;
    autoConfirmedKeyRef.current = key;

    if (primaryAction.kind === 'confirm:payment') {
      startTransition(() => confirmPayment(primaryAction.preorderIds));
    } else {
      startTransition(() => confirmPickup(primaryAction.preorderIds, false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConfirm, summary, mode, primaryAction]);

  function runPrimaryAction() {
    if (primaryAction?.kind === 'confirm:payment') {
      confirmPayment(primaryAction.preorderIds);
    } else if (primaryAction?.kind === 'confirm:pickup') {
      confirmPickup(primaryAction.preorderIds, false);
    }
  }

  const canScan = selectedBatchIds.length > 0;

  return (
    <div className="max-w-2xl mx-auto">
      <BatchPicker
        batches={batches}
        selectedBatchIds={selectedBatchIds}
        onChange={(ids) => {
          setSelectedBatchIds(ids);
          setSummary(null);
          setPrimaryAction(null);
          setError(null);
          setSuccessMessage(null);
        }}
      />

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

      {canScan ? (
        <QrCameraScanner
          paused={primaryAction !== null}
          large
          onScan={lookup}
          onScanCheck={(text) =>
            /^eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(text)
          }
          onClose={() => router.push('/staff')}
        />
      ) : (
        <p className="rounded-xl border border-dashed border-black/15 p-6 text-center text-sm text-zinc-500 dark:border-white/20">
          請先在上方選擇至少一個要合併的梯次，才能開始掃描。
        </p>
      )}

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
              <RosterStatusBadge
                studentId={summary.studentId}
                verificationStatus={summary.rosterVerificationStatus}
              />
            </div>
          </div>

          <ul className="flex flex-col gap-2 text-sm">
            {summary.orders.map((order) => (
              <li
                key={order.preorderId}
                className="rounded-lg border border-black/10 p-2.5 dark:border-white/15"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{order.batchName}</span>
                  <OrderStatusChip
                    paymentStatus={order.paymentStatus}
                    pickupStatus={order.pickupStatus}
                    cancelledAt={order.cancelledAt}
                  />
                </div>
                <ul className="mt-1 flex flex-col gap-0.5 text-xs text-zinc-500">
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
            ))}
          </ul>

          <div className="flex items-center justify-between border-t border-black/10 pt-2 text-sm dark:border-white/15">
            <span className="text-zinc-500">
              {mode === 'payment' ? '尚未收款合計' : '訂單合計'}
            </span>
            <span className="font-medium">
              {formatTWD(
                mode === 'payment'
                  ? summary.unpaidTotalAmount
                  : summary.orders.reduce((sum, o) => sum + o.totalAmount, 0),
              )}
            </span>
          </div>

          {successMessage && (
            <p className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
              <CheckCircleIcon className="h-4 w-4 shrink-0" />
              {successMessage}
            </p>
          )}

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
        </div>
      )}

      <ConfirmDialog
        open={primaryAction?.kind === 'alert:nothing_to_do'}
        title="這位學生目前不需要處理"
        description={primaryAction?.kind === 'alert:nothing_to_do' ? primaryAction.text : ''}
        confirmLabel="知道了，繼續掃描"
        onConfirm={clearPrimaryAction}
        onCancel={clearPrimaryAction}
        onOutsideClick={clearPrimaryAction}
      />

      <ConfirmDialog
        open={showUnpaidConfirm}
        title="部分訂單尚未付款"
        description={`${summary?.studentName ?? '這位同學'}在以下梯次的訂單目前狀態是待付款：${unpaidBatchNames.join('、')}。確定要在還沒收到款項的情況下一起標記取貨嗎？這個動作會記錄在稽核紀錄中。`}
        confirmLabel="仍要標記取貨"
        onConfirm={() => {
          if (primaryAction?.kind === 'confirm:pickup') {
            confirmPickup(primaryAction.preorderIds, true);
          }
        }}
        onCancel={() => setShowUnpaidConfirm(false)}
        pending={pending}
      />
    </div>
  );
}
