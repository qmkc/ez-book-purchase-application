'use client';

import { useState, useTransition } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';

import {
  markFulfilled,
  markPaid,
  refundPayment,
  unmarkFulfilled,
} from '@/app/staff/batches/[batchId]/actions';

// 「標記/撤銷 已付款、已取貨」這四顆按鈕（含各自的二次確認框）原本在
// order-actions.tsx（訂單詳情頁）跟 scan-widget.tsx（掃描核對面板）各寫了
// 一份，文案、行為幾乎一模一樣，統一抽到這裡共用。兩邊唯一會不一樣的地方
// 只有外觀 variant、按鈕文案，跟稽核紀錄裡要記的「操作來源」文字，都開成
// props；其餘（呼叫哪支 server action、什麼時候要跳確認框）行為完全一致。

type ButtonVariant = 'primary' | 'compact';

const primaryButtonClass =
  'rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]';
const compactButtonClass =
  'rounded-full border border-black/15 px-3 py-1 hover:bg-black/4 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/6';
const amberButtonClass =
  'rounded-full border border-amber-600/40 px-5 py-2.5 text-sm text-amber-700 hover:bg-amber-600/10 disabled:opacity-50 dark:text-amber-400';
const revertButtonClass =
  'rounded-full border border-orange-600/40 px-3 py-1 text-orange-700 hover:bg-orange-600/10 disabled:opacity-50 dark:text-orange-400';

export function MarkPaymentButton({
  batchId,
  preorderId,
  variant = 'compact',
  label = '標記已付款',
  className,
  onMarked,
  onError,
}: {
  batchId: string;
  preorderId: string;
  variant?: ButtonVariant;
  label?: string;
  className?: string;
  onMarked?: () => void;
  onError?: (message: string) => void;
}) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await markPaid(preorderId, batchId);
      if (result?.error) {
        onError?.(result.error);
        return;
      }
      onMarked?.();
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleClick}
      className={
        className ?? (variant === 'primary' ? primaryButtonClass : compactButtonClass)
      }
    >
      {pending ? '處理中…' : label}
    </button>
  );
}

// 撤銷已付款跟退款走同一套紀錄（見 refundPayment 的說明：退全額、狀態改回
// 未付款），所以這裡固定用 totalAmount 全額退。如果要退部分金額，走的是
// order-actions 裡「辦理退款」那個獨立的自訂金額流程，不是這顆按鈕。
export function RevertPaymentButton({
  batchId,
  preorderId,
  totalAmount,
  source,
  description = '確定要把這筆訂單的付款狀態撥回未付款嗎？（跟退款走同一套紀錄，會留下稽核軌跡。）',
  className,
  onReverted,
  onError,
}: {
  batchId: string;
  preorderId: string;
  totalAmount: number;
  // 記錄在稽核紀錄裡的操作來源，例如「掃描核對面板」「訂單詳情頁」。
  source: string;
  description?: string;
  className?: string;
  onReverted?: () => void;
  onError?: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await refundPayment(
        preorderId,
        batchId,
        totalAmount,
        `${source}：手動撤銷付款狀態`,
      );
      setOpen(false);
      if (result?.error) {
        onError?.(result.error);
        return;
      }
      onReverted?.();
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen(true)}
        className={className ?? revertButtonClass}
      >
        撤銷已付款
      </button>
      <ConfirmDialog
        open={open}
        title="撤銷已付款"
        description={description}
        confirmLabel="確定撤銷"
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
        pending={pending}
      />
    </>
  );
}

// markFulfilled 遇到訂單還沒標付款時會回報 needsUnpaidConfirmation，這裡統一
// 處理「仍要標記取貨」的二次確認，不用每個呼叫端各自管一份 dialog 狀態。
// unpaidLabel 有給值時，付款狀態是 unpaid 就會換成這個文案+琥珀色樣式
// （order-actions 用來提醒「這筆還沒收到錢」）；scan-widget 的「更多操作」
// 面板不需要這個提醒，不傳就維持一般樣式。
export function MarkPickupButton({
  batchId,
  preorderId,
  paymentStatus,
  pickupLocation = '',
  variant = 'compact',
  label = '標記已取貨',
  unpaidLabel,
  className,
  onMarked,
  onError,
}: {
  batchId: string;
  preorderId: string;
  paymentStatus: 'unpaid' | 'paid';
  pickupLocation?: string;
  variant?: ButtonVariant;
  label?: string;
  unpaidLabel?: string;
  className?: string;
  onMarked?: () => void;
  onError?: (message: string) => void;
}) {
  const [showUnpaidConfirm, setShowUnpaidConfirm] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(allowUnpaid: boolean) {
    startTransition(async () => {
      const result = await markFulfilled(
        preorderId,
        batchId,
        pickupLocation,
        allowUnpaid,
      );
      if (result.needsUnpaidConfirmation) {
        setShowUnpaidConfirm(true);
        return;
      }
      setShowUnpaidConfirm(false);
      if (result.error) {
        onError?.(result.error);
        return;
      }
      onMarked?.();
    });
  }

  const showUnpaidHint = paymentStatus === 'unpaid' && Boolean(unpaidLabel);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(false)}
        className={
          className ??
          (showUnpaidHint
            ? amberButtonClass
            : variant === 'primary'
              ? primaryButtonClass
              : compactButtonClass)
        }
      >
        {pending ? '處理中…' : showUnpaidHint ? unpaidLabel : label}
      </button>
      <ConfirmDialog
        open={showUnpaidConfirm}
        title="此訂單尚未付款"
        description="此訂單目前狀態是待付款，確定要在還沒收到款項的情況下標記取貨嗎？這個動作會記錄在稽核紀錄中。"
        confirmLabel="仍要標記取貨"
        onConfirm={() => run(true)}
        onCancel={() => setShowUnpaidConfirm(false)}
        pending={pending}
      />
    </>
  );
}

export function RevertPickupButton({
  batchId,
  preorderId,
  source,
  className,
  onReverted,
  onError,
}: {
  batchId: string;
  preorderId: string;
  source: string;
  className?: string;
  onReverted?: () => void;
  onError?: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await unmarkFulfilled(
        preorderId,
        batchId,
        `${source}：手動撤銷取貨狀態`,
      );
      setOpen(false);
      if (result?.error) {
        onError?.(result.error);
        return;
      }
      onReverted?.();
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => setOpen(true)}
        className={className ?? revertButtonClass}
      >
        撤銷已取貨
      </button>
      <ConfirmDialog
        open={open}
        title="撤銷已取貨"
        description="確定要把這筆訂單的取貨狀態撥回未取貨嗎？這個動作會記錄在稽核紀錄中。"
        confirmLabel="確定撤銷"
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
        pending={pending}
      />
    </>
  );
}
