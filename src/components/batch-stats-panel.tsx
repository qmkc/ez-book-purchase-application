import type { BatchStats } from '@/lib/batch/batch-catalog';
import { formatTWD } from '@/lib/format';

// 管理員/承辦人員都會用到的梯次總覽數字：訂購人數、書本數量、實收/未收/
// 總金額，加上逐本書的數量拆分表（訂書給出版社、對帳都要用）。純顯示用
// 元件，資料由呼叫端（admin 或 staff 的梯次頁）各自查好（getBatchStats）
// 傳進來，兩邊共用同一份排版，不會顯示得不一致。
export function BatchStatsPanel({ stats }: { stats: BatchStats }) {
  const cards = [
    { label: '訂購人數', value: `${stats.studentCount} 人` },
    { label: '書本總數量', value: `${stats.totalBookQuantity} 本` },
    { label: '目前實收', value: formatTWD(stats.receivedAmount) },
    { label: '尚未收款', value: formatTWD(stats.outstandingAmount) },
    { label: '總金額', value: formatTWD(stats.totalAmount) },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-black/10 p-4 dark:border-white/15"
          >
            <p className="text-xs text-zinc-500">{c.label}</p>
            <p className="mt-1 text-xl font-semibold">{c.value}</p>
          </div>
        ))}
      </div>

      {(stats.fulfilledCount > 0 || stats.cancelledOrderCount > 0) && (
        <p className="mt-2 text-xs text-zinc-500">
          已取貨 {stats.fulfilledCount} / {stats.activeOrderCount} 筆
          {stats.cancelledOrderCount > 0 &&
            ` · 已取消 ${stats.cancelledOrderCount} 筆（不計入以上人數/數量/金額）`}
        </p>
      )}

      {stats.books.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-black/10 dark:border-white/15">
          <table className="w-full min-w-140 text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-zinc-500 dark:border-white/15">
                <th className="px-4 py-2 font-normal">書名</th>
                <th className="px-4 py-2 font-normal">已訂購</th>
                <th className="px-4 py-2 font-normal">已領取</th>
                <th className="px-4 py-2 font-normal">剩餘可訂購</th>
                <th className="px-4 py-2 font-normal">小計</th>
              </tr>
            </thead>
            <tbody>
              {stats.books.map((b) => (
                <tr
                  key={b.bookId}
                  className="border-b border-black/5 last:border-0 dark:border-white/10"
                >
                  <td className="px-4 py-2">{b.title}</td>
                  <td className="px-4 py-2">{b.quantity}</td>
                  <td className="px-4 py-2">
                    {b.fulfilledQuantity}
                    <span className="text-zinc-500">/{b.quantity}</span>
                  </td>
                  <td className="px-4 py-2">
                    {b.remaining === null ? (
                      <span className="text-zinc-500">不限量</span>
                    ) : (
                      b.remaining
                    )}
                  </td>
                  <td className="px-4 py-2">{formatTWD(b.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
