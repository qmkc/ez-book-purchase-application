'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { BookCoverThumbnail } from '@/components/book-cover-thumbnail';
import { OrderStatusChip } from '@/components/order-status-chip';
import { formatDateTime, formatTWD } from '@/lib/format';
import { deriveOrderStatusKey, type OrderStatusKey } from '@/lib/order-status';

const STATUS_FILTERS: { value: OrderStatusKey | 'all'; label: string }[] = [
  { value: 'all', label: '全部（不含已取消）' },
  { value: 'pending_payment', label: '待付款' },
  { value: 'paid', label: '已付款' },
  { value: 'fulfilled', label: '已取貨' },
  { value: 'fulfilled_unpaid', label: '已取貨（未付款）' },
  { value: 'cancelled', label: '已取消' },
];

type OrderRow = {
  id: string;
  paymentStatus: 'unpaid' | 'paid';
  pickupStatus: 'pending' | 'fulfilled';
  cancelledAt: string | Date | null;
  totalAmount: number;
  createdAt: string | Date;
  batchId: string;
  batchName: string;
  books: { bookId: string; title: string; coverImageUrl: string | null }[];
};

export function OrdersList({ orders }: { orders: OrderRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatusKey | 'all'>(
    'all',
  );

  const filteredOrders = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return orders.filter((order) => {
      const key = deriveOrderStatusKey(order);
      // 預設（「全部」）不顯示已取消的訂單，避免洗版；要看已取消訂單請明確點選該篩選。
      if (statusFilter === 'all') {
        if (key === 'cancelled') return false;
      } else if (key !== statusFilter) {
        return false;
      }
      if (!keyword) return true;
      const haystack = [order.batchName, ...order.books.map((b) => b.title)]
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [orders, search, statusFilter]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋梯次名稱或書名"
          className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 sm:max-w-xs dark:border-white/20 dark:focus:border-white/50"
        />
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                statusFilter === filter.value
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-black/15 text-zinc-600 hover:bg-black/4 dark:border-white/20 dark:text-zinc-400 dark:hover:bg-white/6'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          沒有符合搜尋/篩選條件的訂單。
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filteredOrders.map((order) => (
            <li
              key={order.id}
              role="link"
              tabIndex={0}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('a')) return;
                router.push(`/orders/${order.id}`);
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                if ((e.target as HTMLElement).closest('a')) return;
                e.preventDefault();
                router.push(`/orders/${order.id}`);
              }}
              className="cursor-pointer rounded-xl border border-black/10 p-4 transition-colors hover:bg-black/3 dark:border-white/15 dark:hover:bg-white/5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">{order.batchName}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatDateTime(order.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="font-medium">{formatTWD(order.totalAmount)}</p>
                  <OrderStatusChip
                    paymentStatus={order.paymentStatus}
                    pickupStatus={order.pickupStatus}
                    cancelledAt={order.cancelledAt}
                  />
                </div>
              </div>

              <ul className="mt-3 flex flex-col gap-2">
                {order.books.map((book) => (
                  <li key={book.bookId} className="flex items-center gap-2">
                    <BookCoverThumbnail
                      coverImageUrl={book.coverImageUrl}
                      title={book.title}
                      className="h-12 w-9"
                    />
                    <span className="text-sm">{book.title}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-600">
                點擊查看訂單詳情
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
