'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { CheckCircleIcon } from '@/components/icons';
import { QrCameraScanner } from '@/components/qr-camera-scanner';
import { RosterStatusBadge } from '@/components/roster-status-badge';
import { StudentName } from '@/components/student-name';
import { formatTWD } from '@/lib/format';
import { playScanFeedback } from '@/lib/scan-feedback';

import {
  lookupCombinedOrderByCode,
  lookupCombinedOrderByStudentUserId,
  markFulfilledCombined,
  markPaidCombined,
  searchStudentsForCombinedScan,
  type CombinedOrderEntry,
  type CombinedScanSummary,
  type ScannableBatch,
  type StudentSearchResult,
} from './actions';
import { CombinedOrderCard } from './combined-order-card';

type Mode = 'payment' | 'pickup';

const BATCH_STATUS_LABEL: Record<ScannableBatch['status'], string> = {
  draft: '草稿',
  open: '開放中',
  closed: '已結束',
};

type ActionSummary =
  | { kind: 'confirm'; preorderIds: string[]; buttonText: string }
  | { kind: 'empty'; text: string };

// 依「目前模式」＋「目前勾選的訂單」算出底下那顆批次按鈕要做什麼；只吃
// checkedIds 決定的子集，不是 summary.orders 全部——這樣使用者手動勾/取消
// 勾 checkbox 時，按鈕文字（筆數、金額）會立刻反映，不用重新掃描。
function summarizeAction(
  mode: Mode,
  summary: CombinedScanSummary,
  checkedIds: Set<string>,
): ActionSummary {
  const checkedRelevant = summary.orders.filter(
    (order) => !order.cancelledAt && checkedIds.has(order.preorderId),
  );

  const actionable = checkedRelevant.filter((order) =>
    mode === 'payment'
      ? order.paymentStatus === 'unpaid'
      : order.pickupStatus === 'pending',
  );

  if (actionable.length > 0) {
    const preorderIds = actionable.map((order) => order.preorderId);
    if (mode === 'payment') {
      const total = actionable.reduce(
        (sum, order) => sum + order.totalAmount,
        0,
      );
      return {
        kind: 'confirm',
        preorderIds,
        buttonText: `確認已付款（${actionable.length} 筆・合計 ${formatTWD(total)}）`,
      };
    }
    return {
      kind: 'confirm',
      preorderIds,
      buttonText: `確認已取貨（${actionable.length} 筆）`,
    };
  }

  if (checkedRelevant.length === 0) {
    const anyCheckedAtAll = summary.orders.some((order) =>
      checkedIds.has(order.preorderId),
    );
    if (!anyCheckedAtAll) {
      return {
        kind: 'empty',
        text: '此學生在您目前勾選的合併範圍內沒有訂單；下方顯示的是其他梯次的訂單，請視需要手動勾選要處理的項目。',
      };
    }
    return { kind: 'empty', text: '已勾選的訂單皆已取消，無法處理。' };
  }

  return {
    kind: 'empty',
    text:
      mode === 'payment'
        ? '已勾選的訂單皆已付款，不需要再收一次。'
        : '已勾選的訂單皆已取貨，不需要再標記一次。',
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
          合併範圍{' '}
          {selectedBatchIds.length > 0 &&
            `（已選 ${selectedBatchIds.length} 個梯次）`}
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

const ROSTER_LABEL: Record<StudentSearchResult['verificationStatus'], string> =
  {
    verified: '已核實',
    unverified: '已綁定未核實',
    unbound: '尚未綁定名冊',
  };

// 只給管理員用的「直接搜尋特定人員」：debounce 打 searchStudentsForCombinedScan
// （學號/姓名/email 都比對），點選結果直接觸發 onSelect，交由外層跑跟掃描
// 完全一樣的後續流程（見 ScanWidget 的 applyLookupResult）。用 onMouseDown
// 而不是 onClick 選結果，是為了在 input 的 onBlur 收起清單之前先觸發選取。
function StudentSearchBox({
  onSelect,
}: {
  onSelect: (userId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StudentSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, startSearching] = useTransition();

  useEffect(() => {
    const q = query.trim();
    // 少於 2 個字不查，但故意不在這裡同步清空 results——下面渲染時本來就只
    // 在 query 夠長時才顯示清單，字數不夠時舊結果留著也不會被畫出來，等
    // 使用者再打到 2 個字以上就會被新的查詢結果蓋掉。
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      startSearching(async () => {
        setResults(await searchStudentsForCombinedScan(q));
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, startSearching]);

  return (
    <div className="relative mb-3">
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="或直接搜尋學生：學號、姓名、Email"
        className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
      />
      {open && query.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-black/10 bg-zinc-50 shadow-lg dark:border-white/15 dark:bg-zinc-900">
          {searching ? (
            <p className="px-3 py-2 text-sm text-zinc-500">搜尋中…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-zinc-500">找不到符合的學生</p>
          ) : (
            results.map((r) => (
              <button
                key={r.userId}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(r.userId);
                  setQuery('');
                  setResults([]);
                  setOpen(false);
                }}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-black/4 dark:hover:bg-white/6"
              >
                <span className="font-medium">
                  {r.realName ?? r.name}
                  {r.studentId && (
                    <span className="ml-1 text-xs text-zinc-500">
                      （{r.studentId}）
                    </span>
                  )}
                </span>
                <span className="text-xs text-zinc-500">
                  {r.email} ・ {ROSTER_LABEL[r.verificationStatus]}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function ScanWidget({
  batches,
  isAdmin,
}: {
  batches: ScannableBatch[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>(
    batches.filter((b) => b.status === 'open').map((b) => b.id),
  );
  const [mode, setMode] = useState<Mode>('payment');
  const [summary, setSummary] = useState<CombinedScanSummary | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 掃描當下就算好的一次性提示（例如「這位同學不用處理」），只在剛掃到
  // 那一刻跳出來；之後使用者手動調整 checkbox 不會再觸發它，只會更新下面
  // 即時反應的 actionSummary。
  const [scanAlert, setScanAlert] = useState<{ text: string } | null>(null);
  const [showUnpaidConfirm, setShowUnpaidConfirm] = useState(false);
  const [unpaidBatchNames, setUnpaidBatchNames] = useState<string[]>([]);
  const [pendingPickupIds, setPendingPickupIds] = useState<string[] | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  // 自動確認分模式各自記憶：付款預設關閉，因為承辦人員通常要先看清楚
  // 「這筆該收多少錢」才能跟學生核對現金，不能一掃就自動標記已付款；取貨
  // 沒有金額要核對，預設開著讓掃描更快。使用者在某個模式手動切換過，切換
  // payment/pickup 分頁時各自保留自己的設定。
  const [autoConfirmByMode, setAutoConfirmByMode] = useState<
    Record<Mode, boolean>
  >({ payment: false, pickup: true });
  const autoConfirm = autoConfirmByMode[mode];

  // 鏡頭在「正在審核某位學生的掃描結果」期間暫停，批次動作跑完或關掉一次
  // 性提示後才恢復；單筆快捷操作（確認/撤銷付款、取貨）不影響這個狀態，
  // 讓承辦人員可以連續處理同一位學生的多筆訂單再繼續掃下一位。
  const [reviewOpen, setReviewOpen] = useState(false);

  // 已取消的訂單預設不顯示——現場核對時大多不需要看到它們，需要時再手動
  // 展開。checkedIds/summarizeAction 本來就已經排除掉已取消的訂單，這裡只
  // 影響要不要把它畫出來。
  const [showCancelled, setShowCancelled] = useState(false);

  const actionSummary = useMemo(
    () => (summary ? summarizeAction(mode, summary, checkedIds) : null),
    [mode, summary, checkedIds],
  );
  const cancelledCount =
    summary?.orders.filter((order) => order.cancelledAt).length ?? 0;
  const visibleOrders = summary
    ? summary.orders.filter((order) => showCancelled || !order.cancelledAt)
    : [];

  function dismissScanAlert() {
    setScanAlert(null);
    setReviewOpen(false);
  }

  function toggleChecked(preorderId: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(preorderId)) next.delete(preorderId);
      else next.add(preorderId);
      return next;
    });
  }

  // 掃 QR code 跟管理員直接搜尋選人這兩條路徑，找到學生之後的後續流程完全
  // 一樣（設預設勾選、跳一次性提示或自動確認），共用這支函式；只有「怎麼
  // 找到這個人」不同。
  function applyLookupResult(
    result:
      | { ok: false; error: string }
      | { ok: true; summary: CombinedScanSummary },
  ) {
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSummary(result.summary);
    setShowUnpaidConfirm(false);
    setUnpaidBatchNames([]);
    setPendingPickupIds(null);
    setReviewOpen(true);
    setShowCancelled(false);

    const defaultChecked = new Set(
      result.summary.orders
        .filter(
          (order) =>
            !order.cancelledAt && selectedBatchIds.includes(order.batchId),
        )
        .map((order) => order.preorderId),
    );
    setCheckedIds(defaultChecked);

    const initial = summarizeAction(mode, result.summary, defaultChecked);
    if (initial.kind === 'empty') {
      setScanAlert({ text: initial.text });
      return;
    }
    setScanAlert(null);
    if (autoConfirm) {
      if (mode === 'payment') confirmPayment(initial.preorderIds);
      else confirmPickup(initial.preorderIds, false);
    }
  }

  function lookup(value: string) {
    setError(null);
    setSuccessMessage(null);
    startTransition(async () => {
      const result = await lookupCombinedOrderByCode(selectedBatchIds, value);
      if (result.ok) playScanFeedback();
      applyLookupResult(result);
    });
  }

  function selectStudent(studentUserId: string) {
    setError(null);
    setSuccessMessage(null);
    startTransition(async () => {
      const result = await lookupCombinedOrderByStudentUserId(studentUserId);
      applyLookupResult(result);
    });
  }

  function resolveAction(
    message: string,
    preorderIds: string[],
    patch: Partial<Pick<CombinedOrderEntry, 'paymentStatus' | 'pickupStatus'>>,
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
    setSuccessMessage(message);
    setError(null);
    setShowUnpaidConfirm(false);
    setUnpaidBatchNames([]);
    setPendingPickupIds(null);
    setReviewOpen(false);
    router.refresh();
  }

  function resolveOrder(
    preorderId: string,
    patch: Partial<Pick<CombinedOrderEntry, 'paymentStatus' | 'pickupStatus'>>,
    message: string,
  ) {
    setSummary((prev) =>
      prev
        ? {
            ...prev,
            orders: prev.orders.map((order) =>
              order.preorderId === preorderId ? { ...order, ...patch } : order,
            ),
          }
        : prev,
    );
    setSuccessMessage(message);
    setError(null);
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
        setPendingPickupIds(preorderIds);
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

  function runPrimaryAction() {
    if (!actionSummary || actionSummary.kind !== 'confirm') return;
    if (mode === 'payment') confirmPayment(actionSummary.preorderIds);
    else confirmPickup(actionSummary.preorderIds, false);
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
          setCheckedIds(new Set());
          setScanAlert(null);
          setReviewOpen(false);
          setShowCancelled(false);
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
              onChange={(e) =>
                setAutoConfirmByMode((prev) => ({
                  ...prev,
                  [mode]: e.target.checked,
                }))
              }
              className="h-3.5 w-3.5 accent-foreground"
            />
            自動確認
          </label>
        </div>
      </div>

      {canScan && isAdmin && <StudentSearchBox onSelect={selectStudent} />}

      {canScan ? (
        <QrCameraScanner
          paused={reviewOpen}
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
              <StudentName
                realName={summary.realName}
                googleName={summary.studentName}
              />
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

          {successMessage && (
            <p className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
              <CheckCircleIcon className="h-4 w-4 shrink-0" />
              {successMessage}
            </p>
          )}

          {/* 批次動作按鈕放在訂單清單上面，避免梯次一多要滑到最下面才點得
              到——內容照舊即時反應目前勾選狀態。 */}
          {actionSummary &&
            (actionSummary.kind === 'confirm' ? (
              <button
                type="button"
                disabled={pending}
                onClick={runPrimaryAction}
                className="w-full rounded-2xl bg-foreground py-4 text-lg font-semibold text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
              >
                {pending ? '處理中…' : actionSummary.buttonText}
              </button>
            ) : (
              <p className="text-center text-sm text-zinc-500">
                {actionSummary.text}
              </p>
            ))}

          {cancelledCount > 0 && (
            <button
              type="button"
              onClick={() => setShowCancelled((v) => !v)}
              className="self-start text-xs text-zinc-500 underline"
            >
              {showCancelled
                ? '隱藏已取消的訂單'
                : `顯示已取消的訂單（${cancelledCount} 筆）`}
            </button>
          )}

          <ul className="flex flex-col gap-2 text-sm">
            {visibleOrders.map((order) => (
              <CombinedOrderCard
                key={order.preorderId}
                order={order}
                checked={checkedIds.has(order.preorderId)}
                onToggleChecked={() => toggleChecked(order.preorderId)}
                onResolved={resolveOrder}
                onError={setError}
              />
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={scanAlert !== null}
        title="這位學生目前不需要處理"
        description={scanAlert?.text ?? ''}
        confirmLabel="知道了，繼續掃描"
        onConfirm={dismissScanAlert}
        onCancel={dismissScanAlert}
        onOutsideClick={dismissScanAlert}
      />

      <ConfirmDialog
        open={showUnpaidConfirm}
        title="部分訂單尚未付款"
        description={`${summary?.realName ?? summary?.studentName ?? '這位同學'}在以下梯次的訂單目前狀態是待付款：${unpaidBatchNames.join('、')}。確定要在還沒收到款項的情況下一起標記取貨嗎？這個動作會記錄在稽核紀錄中。`}
        confirmLabel="仍要標記取貨"
        onConfirm={() => confirmPickup(pendingPickupIds ?? [], true)}
        onCancel={() => {
          setShowUnpaidConfirm(false);
          setPendingPickupIds(null);
        }}
        pending={pending}
      />
    </div>
  );
}
