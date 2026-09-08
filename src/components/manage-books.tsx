'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useState, useTransition } from 'react';

import { XMarkIcon } from '@/components/icons';
import { formatBookRef, formatTWD } from '@/lib/format';

import {
  addBookToBatch,
  addPriceTier,
  deletePriceTier,
  setBatchBookActive,
} from '@/app/admin/batches/actions';

type Tier = { id: string; minQuantity: number; price: number };
type BookRef = { isbn: string | null; author: string | null; publisher: string | null };
type BatchBook = BookRef & {
  id: string;
  bookId: string;
  title: string;
  quantityLimit: number | null;
  isActive: boolean;
  tiers: Tier[];
};
type AvailableBook = BookRef & { id: string; title: string };

export function ManageBooks({
  batchId,
  batchBooks,
  availableBooks,
  newBookHref,
}: {
  batchId: string;
  batchBooks: BatchBook[];
  availableBooks: AvailableBook[];
  newBookHref?: string;
}) {
  const addAction = addBookToBatch.bind(null, batchId);
  const [addState, addFormAction, addPending] = useActionState(
    addAction,
    undefined,
  );

  return (
    <div className="flex flex-col gap-4">
      {batchBooks.map((batchBook) => (
        <BatchBookCard
          key={batchBook.id}
          batchId={batchId}
          batchBook={batchBook}
        />
      ))}

      <div className="rounded-xl border border-dashed border-black/20 p-4 dark:border-white/25">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">新增書籍到此梯次</h3>
          {newBookHref && (
            <Link
              href={newBookHref}
              className="text-xs text-zinc-500 underline shrink-0"
            >
              找不到書籍？先新增一本
            </Link>
          )}
        </div>
        {availableBooks.length === 0 ? (
          <p className="text-sm text-zinc-500">所有書籍都已加入此梯次。</p>
        ) : (
          <form
            action={addFormAction}
            className="flex flex-wrap items-end gap-3"
          >
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm sm:flex-none sm:w-64">
              書籍
              <select
                name="bookId"
                required
                className="w-full max-w-full truncate rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
              >
                {availableBooks.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.title}
                    {formatBookRef(book) ? `（${formatBookRef(book)}）` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              基本售價
              <input
                name="basePrice"
                type="number"
                min={0}
                required
                className="w-28 rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              數量上限（留空不限量）
              <input
                name="quantityLimit"
                type="number"
                min={1}
                className="w-40 rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
              />
            </label>
            <button
              type="submit"
              disabled={addPending}
              className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
            >
              {addPending ? '新增中…' : '加入'}
            </button>
          </form>
        )}
        {addState?.error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">
            {addState.error}
          </p>
        )}
      </div>
    </div>
  );
}

function BatchBookCard({
  batchId,
  batchBook,
}: {
  batchId: string;
  batchBook: BatchBook;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tierOpen, setTierOpen] = useState(false);
  const tierAction = addPriceTier.bind(null, batchBook.id, batchId);
  const [tierState, tierFormAction, tierPending] = useActionState(
    tierAction,
    undefined,
  );

  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/15">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            href={`/books/${batchBook.bookId}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            {batchBook.title}
          </Link>
          {formatBookRef(batchBook) && (
            <p className="text-xs text-zinc-500">{formatBookRef(batchBook)}</p>
          )}
          <p className="text-xs text-zinc-500">
            {batchBook.quantityLimit === null
              ? '不限量'
              : `數量上限 ${batchBook.quantityLimit}`}
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setBatchBookActive(
                batchBook.id,
                batchId,
                !batchBook.isActive,
              );
              router.refresh();
            })
          }
          className="shrink-0 rounded-full border border-black/15 px-3 py-1 text-xs hover:bg-black/4 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/6"
        >
          {batchBook.isActive ? '下架' : '上架'}
        </button>
      </div>

      <ul className="mt-3 flex flex-wrap gap-2 text-xs">
        {batchBook.tiers
          .slice()
          .sort((a, b) => a.minQuantity - b.minQuantity)
          .map((tier) => (
            <li
              key={tier.id}
              className="flex items-center gap-1 rounded-full bg-black/5 px-3 py-1 dark:bg-white/8"
            >
              滿 {tier.minQuantity} 件 {formatTWD(tier.price)}
              {tier.minQuantity !== 1 && (
                <button
                  type="button"
                  onClick={() =>
                    startTransition(async () => {
                      await deletePriceTier(tier.id, batchId);
                      router.refresh();
                    })
                  }
                  className="ml-1 text-zinc-500 hover:text-red-600"
                  aria-label="刪除此級距"
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
      </ul>

      {tierOpen ? (
        <form
          action={tierFormAction}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <label className="flex flex-col gap-1 text-xs">
            滿幾件
            <input
              name="minQuantity"
              type="number"
              min={2}
              required
              className="w-24 rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            單價
            <input
              name="price"
              type="number"
              min={0}
              required
              className="w-24 rounded-md border border-black/15 bg-transparent px-2 py-1 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
            />
          </label>
          <button
            type="submit"
            disabled={tierPending}
            className="rounded-full border border-black/15 px-3 py-1.5 text-xs hover:bg-black/4 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/6"
          >
            {tierPending ? '新增中…' : '新增級距'}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setTierOpen(true)}
          className="mt-3 text-xs text-zinc-500 underline"
        >
          + 新增團購級距
        </button>
      )}
      {tierState?.error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
          {tierState.error}
        </p>
      )}
    </div>
  );
}
