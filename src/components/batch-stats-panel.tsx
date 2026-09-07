import type { BatchStats } from '@/lib/batch/batch-catalog';
import { formatTWD } from '@/lib/format';

// 管理員/承辦人員都會用到的梯次總覽數字：訂購人數、書本數量、收款/交付
// 筆數、實收/未收/總金額，加上逐本書的數量拆分表（訂書給出版社、對帳都要
// 用）。純顯示用元件，資料由呼叫端（admin 或 staff 的梯次頁）各自查好
// （getBatchStats）傳進來，兩邊共用同一份排版，不會顯示得不一致。
export function BatchStatsPanel({ stats }: { stats: BatchStats }) {
  // 「筆」是訂單數，不是人數——理論上一人一梯次可以有不只一筆訂單，跟上面
  // 訂購人數不保證對得起來，見 getBatchStats 的說明。已收款/已交付用
  // 「X / 總筆數」表示，不用另外拆「尚未 xxx」出來各佔一張卡——跟下面逐本書
  // 表格的「已領取」欄位（X/quantity）同一種呈現方式，一眼就看得出還缺多少。
  const cards = [
    { label: '訂購人數', value: `${stats.studentCount} 人` },
    { label: '書本總數量', value: `${stats.totalBookQuantity} 本` },
    {
      label: '已收款',
      value: `${stats.paidCount} / ${stats.activeOrderCount} 筆`,
    },
    {
      label: '已交付',
      value: `${stats.fulfilledCount} / ${stats.activeOrderCount} 筆`,
    },
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

      {stats.cancelledOrderCount > 0 && (
        <p className="mt-2 text-xs text-zinc-500">
          已取消 {stats.cancelledOrderCount} 筆（不計入以上人數/筆數/數量/金額）
        </p>
      )}

      {stats.books.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-black/10 dark:border-white/15">
          <table className="w-full min-w-140 text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-zinc-500 dark:border-white/15">
                <th className="px-4 py-2 font-normal">書名</th>
                <th className="px-4 py-2 font-normal">總本數</th>
                <th className="px-4 py-2 font-normal">已交付+尚未交付</th>
                <th className="px-4 py-2 font-normal">剩餘可訂購</th>
                <th className="px-4 py-2 font-normal">小計</th>
              </tr>
            </thead>
            <tbody>
              {/* 已交付 + 尚未交付 = 總本數（分開一欄），管理員定期清點實體
                  庫存時拿「尚未交付」那個數字去對，抓有沒有少書。顏色跟站上
                  其他地方的慣例對齊（見 order-status-chip.tsx）：已交付＝
                  綠，尚未交付＝琥珀色。 */}
              {stats.books.map((b) => (
                <tr
                  key={b.bookId}
                  className="border-b border-black/5 last:border-0 dark:border-white/10"
                >
                  <td className="px-4 py-2">{b.title}</td>
                  <td className="px-4 py-2">{b.quantity}</td>
                  <td className="px-4 py-2">
                    <span className="text-green-700 dark:text-green-400">
                      {b.fulfilledQuantity}
                    </span>
                    +
                    <span className="text-amber-700 dark:text-amber-400">
                      {b.quantity - b.fulfilledQuantity}
                    </span>
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
