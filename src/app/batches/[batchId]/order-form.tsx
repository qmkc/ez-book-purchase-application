'use client';

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';

import { BookCoverThumbnail } from '@/components/book-cover-thumbnail';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { formatTWD } from '@/lib/format';

import { createPreorder } from './actions';

type BookRow = {
  batchBookId: string;
  bookId: string;
  title: string;
  author: string | null;
  coverImageUrl: string | null;
  listPrice: number;
  quantityLimit: number | null;
  alreadyOrdered: number;
  nextUnitPrice: number | null;
  tiers: { minQuantity: number; price: number }[];
};

export function OrderForm({
  batchId,
  books,
}: {
  batchId: string;
  books: BookRow[];
}) {
  const action = createPreorder.bind(null, batchId);
  const [state, formAction, pending] = useActionState(action, undefined);
  // 預設每本書都先填 1（已經賣完/超過數量上限的書除外，那些預設 0 且欄位本來
  // 就會被停用），讓學生看到的畫面直接就是「全部都要買一本」，不想要的書自己
  // 改成 0 即可——比每本書都要自己手動輸入 1 更快。
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      books.map((book) => {
        const remaining =
          book.quantityLimit === null
            ? null
            : Math.max(book.quantityLimit - book.alreadyOrdered, 0);
        return [book.bookId, remaining === 0 ? 0 : 1];
      }),
    ),
  );
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const confirmMergeInputRef = useRef<HTMLInputElement>(null);

  // 每次動作回來，只要伺服器說「需要確認併單」就跳出對話框——即使使用者上次
  // 取消過，重新送出一次還是要再問一次（用整個 state 物件當依賴，而不是只
  // 看 needsConfirmation 的值本身，才會在「內容一樣」的重試也重新觸發）。
  useEffect(() => {
    if (state?.needsConfirmation) {
      startTransition(() => setShowMergeDialog(true));
    }
  }, [state]);

  const estimatedTotal = useMemo(
    () =>
      books.reduce((sum, book) => {
        const qty = quantities[book.bookId] ?? 0;
        const price = book.nextUnitPrice ?? book.listPrice;
        return sum + qty * price;
      }, 0),
    [books, quantities],
  );

  function handleConfirmMerge() {
    if (confirmMergeInputRef.current) confirmMergeInputRef.current.value = '1';
    setShowMergeDialog(false);
    formRef.current?.requestSubmit();
  }

  function handleCancelMerge() {
    setShowMergeDialog(false);
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="mt-6 flex flex-col gap-4"
    >
      <input
        ref={confirmMergeInputRef}
        type="hidden"
        name="confirmMerge"
        defaultValue=""
      />
      <ul className="flex flex-col gap-3">
        {books.map((book) => {
          const remaining =
            book.quantityLimit === null
              ? null
              : Math.max(book.quantityLimit - book.alreadyOrdered, 0);
          return (
            <li
              key={book.batchBookId}
              className="flex flex-col gap-2 rounded-xl border border-black/10 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/15"
            >
              <div className="flex gap-3">
                <BookCoverThumbnail
                  coverImageUrl={book.coverImageUrl}
                  title={book.title}
                />
                <div>
                  <p className="font-medium">{book.title}</p>
                  {book.author && (
                    <p className="text-xs text-zinc-500">{book.author}</p>
                  )}
                  <p className="mt-1 text-sm">
                    目前單價 {formatTWD(book.nextUnitPrice ?? book.listPrice)}
                    <span className="ml-1 text-xs text-zinc-500 line-through">
                      {formatTWD(book.listPrice)}
                    </span>
                  </p>
                  {book.tiers.length > 1 && (
                    <p className="mt-1 text-xs text-zinc-500">
                      團購級距：
                      {book.tiers
                        .map(
                          (t) => `滿 ${t.minQuantity} 件 ${formatTWD(t.price)}`,
                        )
                        .join('、')}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-zinc-300">
                    目前已預購 {book.alreadyOrdered} 本
                  </p>
                  {remaining !== null && (
                    <p className="mt-1 text-xs text-zinc-300">
                      剩餘 {remaining} 件可預購
                    </p>
                  )}
                </div>
              </div>
              <input
                type="number"
                name={`qty-${book.bookId}`}
                min={0}
                max={remaining ?? undefined}
                // 用 state 控制（而不是 defaultValue）：確認併單對話框跳出來，
                // 代表已經送出過一次 action 了，React 會把沒被 state 控制的
                // 欄位重置成初始值——如果這裡還是 uncontrolled，使用者按下
                // 「加入既有訂單」重新送出時，數量早就被重置成 0 了。
                value={quantities[book.bookId] ?? 0}
                disabled={remaining === 0}
                onChange={(e) =>
                  setQuantities((prev) => ({
                    ...prev,
                    [book.bookId]: Number(e.target.value) || 0,
                  }))
                }
                className="w-24 rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
              />
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between rounded-xl border border-black/10 px-4 py-3 dark:border-white/15">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          預估總金額
        </span>
        <span className="text-lg font-semibold">
          {formatTWD(estimatedTotal)}
        </span>
      </div>

      {state?.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {pending ? '送出中…' : '送出預購'}
      </button>
      <p className="text-xs text-zinc-500">
        實際成交金額以送出當下的團購級距為準，可能與預估金額略有差異。
      </p>

      <ConfirmDialog
        open={showMergeDialog}
        title="已經有一筆待付款的訂單"
        description={`您在此梯次已經有一筆待付款訂單（金額 ${formatTWD(
          state?.existingOrderTotal ?? 0,
        )}），是否要把這次選的書籍加進去，合併成同一筆訂單？`}
        confirmLabel="加入既有訂單"
        onConfirm={handleConfirmMerge}
        onCancel={handleCancelMerge}
        pending={pending}
      />
    </form>
  );
}
