'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';

import { BookCoverThumbnail } from '@/components/book-cover-thumbnail';
import { formatTWD } from '@/lib/format';

import { updateOrderItemQuantities } from './actions';

type ItemRow = {
  id: string;
  bookId: string;
  title: string;
  coverImageUrl: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  alreadyOrdered: number;
};

// 待付款訂單可以直接在這裡改數量（改成 0 等於移除那本書），不用回梯次頁面
// 重新下單。價格一律依送出當下的團購級距重新計算，跟建立新單同一套規則。
export function EditableOrderItems({
  preorderId,
  items,
  totalAmount,
}: {
  preorderId: string;
  items: ItemRow[];
  totalAmount: number;
}) {
  const router = useRouter();
  const action = updateOrderItemQuantities.bind(null, preorderId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((item) => [item.bookId, item.quantity])),
  );

  useEffect(() => {
    if (state?.success) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-4 rounded-xl border border-black/10 px-4 py-3 text-sm dark:border-white/15"
          >
            <div className="flex items-center gap-3">
              <BookCoverThumbnail
                coverImageUrl={item.coverImageUrl}
                title={item.title}
                className="h-12 w-9"
              />
              <div>
                <Link
                  href={`/books/${item.bookId}`}
                  className="font-medium hover:underline"
                >
                  {item.title}
                </Link>
                <p className="text-xs text-zinc-500">
                  單價 {formatTWD(item.unitPrice)}
                </p>
                <p className="text-xs text-zinc-500">
                  目前已預購 {item.alreadyOrdered} 本
                </p>
              </div>
            </div>
            <input
              type="number"
              name={`qty-${item.bookId}`}
              min={0}
              value={quantities[item.bookId] ?? 0}
              onChange={(e) =>
                setQuantities((prev) => ({
                  ...prev,
                  [item.bookId]: Number(e.target.value) || 0,
                }))
              }
              className="w-20 rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
            />
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between rounded-xl border border-black/10 px-4 py-3 dark:border-white/15">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          目前總金額
        </span>
        <span className="text-lg font-semibold">{formatTWD(totalAmount)}</span>
      </div>

      {state?.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {state?.success && (
        <p className="text-sm text-green-700 dark:text-green-400">已更新訂單</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full border border-black/15 px-4 py-2 text-sm hover:bg-black/4 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/6"
      >
        {pending ? '更新中…' : '更新訂單數量'}
      </button>
      <p className="text-xs text-zinc-500">
        數量改成 0 代表移除該本書；更新後的金額以送出當下的團購級距為準。
        梯次截止或您完成付款前，金額也會隨其他人的訂購/取消即時調整，不是
        固定不變的。
      </p>
    </form>
  );
}
