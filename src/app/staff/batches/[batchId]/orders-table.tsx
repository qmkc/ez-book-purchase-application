'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { OrderStatusChip } from '@/components/order-status-chip';
import { RosterStatusBadge } from '@/components/roster-status-badge';
import { formatDateTime, formatTWD } from '@/lib/format';
import { deriveOrderStatusKey, type OrderStatusKey } from '@/lib/order-status';
import type { RosterVerificationStatus } from '@/lib/roster/roster-lookup';

const STATUS_FILTERS: { value: OrderStatusKey | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending_payment', label: '待付款' },
  { value: 'paid', label: '已付款' },
  { value: 'fulfilled', label: '已取貨' },
  { value: 'fulfilled_unpaid', label: '已取貨（未付款）' },
  { value: 'cancelled', label: '已取消' },
];

const PAGE_SIZE = 20;

export type StaffOrderRow = {
  id: string;
  studentName: string;
  studentEmail: string;
  studentId: string | null;
  rosterVerificationStatus: RosterVerificationStatus;
  totalAmount: number;
  paymentStatus: 'unpaid' | 'paid';
  pickupStatus: 'pending' | 'fulfilled';
  cancelledAt: string | Date | null;
  createdAt: string | Date;
};

// 承辦人員梯次頁的訂單列表：搜尋框輸入姓名/email 時，除了直接過濾下面的
// 表格，也會跳出一個下拉的「使用者搜尋」小組件（同一套視覺/互動邏輯跟
// 管理員新增承辦人員用的 UserSearchPicker 一致），點一下符合的人直接跳去
// 那筆訂單的詳情頁，不用自己在一長串表格裡找。資料本來就已經整批抓下來
// 了（單一梯次規模不大），搜尋/分頁都在前端做，不用另外打伺服器。
export function OrdersTable({
  orders,
  batchId,
}: {
  orders: StaffOrderRow[];
  batchId: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatusKey | 'all'>(
    'all',
  );
  const [page, setPage] = useState(1);
  const [pickerOpen, setPickerOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const keyword = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return orders.filter((order) => {
      const key = deriveOrderStatusKey(order);
      // 「全部」預設不含已取消的訂單——已取消的訂單不用付款/不用交書，
      // 混在預設列表裡只會讓承辦人員誤以為還要處理；想看已取消的訂單另外
      // 點下面的「已取消」篩選即可，不是完全從畫面上消失。
      if (statusFilter === 'all') {
        if (key === 'cancelled') return false;
      } else if (key !== statusFilter) {
        return false;
      }
      if (!keyword) return true;
      return `${order.studentName} ${order.studentEmail} ${order.studentId ?? ''}`
        .toLowerCase()
        .includes(keyword);
    });
  }, [orders, keyword, statusFilter]);

  // 下拉挑人用的候選名單：只看姓名/email/學號是否符合，不管狀態篩選——搜尋是
  // 「幫你找到這個人」，不應該因為選了某個狀態篩選就找不到人。
  const pickerMatches = useMemo(() => {
    if (!keyword) return [];
    return orders
      .filter((o) =>
        `${o.studentName} ${o.studentEmail} ${o.studentId ?? ''}`
          .toLowerCase()
          .includes(keyword),
      )
      .slice(0, 8);
  }, [orders, keyword]);

  // 搜尋字/狀態篩選一變動就跳回第一頁——用 React 官方建議的「render 期間比對
  // 並同步」寫法（見 status-watcher.tsx 同樣手法），不用 effect：在 effect
  // 裡呼叫 setState 屬於「多餘的 render」，這裡直接在 render body 比對上一次
  // 的篩選條件，變了就同一輪重新渲染時把頁碼撥回 1，不會先閃一次舊頁碼。
  const filterKey = `${keyword} ${statusFilter}`;
  const [syncedFilterKey, setSyncedFilterKey] = useState(filterKey);
  if (filterKey !== syncedFilterKey) {
    setSyncedFilterKey(filterKey);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div ref={containerRef} className="relative w-full sm:max-w-xs">
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPickerOpen(Boolean(e.target.value.trim()));
            }}
            onFocus={() => query.trim() && setPickerOpen(true)}
            placeholder="搜尋學生姓名、email 或學號"
            autoComplete="off"
            className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
          />
          {pickerOpen && keyword && (
            <ul className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-black/10 bg-zinc-50 py-1 shadow-lg dark:border-white/15 dark:bg-zinc-900">
              {pickerMatches.length === 0 ? (
                <li className="px-3 py-1.5 text-xs text-zinc-500">
                  沒有符合的學生
                </li>
              ) : (
                pickerMatches.map((order) => (
                  <li key={order.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPickerOpen(false);
                        router.push(
                          `/staff/batches/${batchId}/orders/${order.id}`,
                        );
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-black/4 dark:hover:bg-white/6"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">
                          {order.studentName}
                        </span>
                        <span className="block truncate text-xs text-zinc-500">
                          {order.studentEmail}
                        </span>
                        <RosterStatusBadge
                          studentId={order.studentId}
                          verificationStatus={order.rosterVerificationStatus}
                          className="mt-1"
                        />
                      </span>
                      <OrderStatusChip
                        paymentStatus={order.paymentStatus}
                        pickupStatus={order.pickupStatus}
                        cancelledAt={order.cancelledAt}
                        className="shrink-0"
                      />
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
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

      <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/15">
        <table className="w-full min-w-160 text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-zinc-500 dark:border-white/15">
              <th className="px-4 py-2 font-normal">學生</th>
              <th className="px-4 py-2 font-normal">學號 / 認證狀態</th>
              <th className="px-4 py-2 font-normal">金額</th>
              <th className="px-4 py-2 font-normal">狀態</th>
              <th className="px-4 py-2 font-normal">建立時間</th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                  沒有符合搜尋/篩選條件的訂單。
                </td>
              </tr>
            ) : (
              paged.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-black/5 last:border-0 dark:border-white/10"
                >
                  <td className="px-4 py-2">
                    <Link
                      href={`/staff/batches/${batchId}/orders/${order.id}`}
                      className="hover:underline"
                    >
                      {order.studentName}
                      <span className="ml-1 text-xs text-zinc-500">
                        {order.studentEmail}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <RosterStatusBadge
                      studentId={order.studentId}
                      verificationStatus={order.rosterVerificationStatus}
                    />
                  </td>
                  <td className="px-4 py-2">{formatTWD(order.totalAmount)}</td>
                  <td className="px-4 py-2">
                    <OrderStatusChip
                      paymentStatus={order.paymentStatus}
                      pickupStatus={order.pickupStatus}
                      cancelledAt={order.cancelledAt}
                    />
                  </td>
                  <td className="px-4 py-2 text-zinc-500">
                    {formatDateTime(order.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-full border border-black/15 px-3 py-1 hover:bg-black/4 disabled:pointer-events-none disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/6"
          >
            上一頁
          </button>
          <span className="text-zinc-500">
            第 {page} / {totalPages} 頁（共 {filtered.length} 筆）
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-full border border-black/15 px-3 py-1 hover:bg-black/4 disabled:pointer-events-none disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/6"
          >
            下一頁
          </button>
        </div>
      )}
    </div>
  );
}
