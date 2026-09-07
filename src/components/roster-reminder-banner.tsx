import Link from 'next/link';

import type { RosterVerificationStatus } from '@/lib/roster/roster-lookup';

import { HideOnPath } from './hide-on-path';

// 只有「完全沒填」才用這種整條的大警告——這是需要使用者主動去做一件事的
// 行動呼籲，值得顯眼一點。「填了但還沒核實」不算使用者還欠什麼，只是在等
// 管理員，改成 Header 姓名旁邊一個小提示就好（見 header.tsx 的
// rosterStatus），不用每頁都跳一條大的出來煩使用者。
// 放在 root layout，狀態由呼叫端（layout.tsx）算好傳進來，這裡純顯示，不
// 自己查一次 DB——跟 Header 共用同一份 rosterStatus，不會兩邊查出不一致的
// 結果。/bind-roster 本身已經在做這件事，疊一層提醒反而多餘，用 HideOnPath
// 擋掉。
export function RosterReminderBanner({
  status,
}: {
  status: RosterVerificationStatus;
}) {
  if (status !== 'unbound') return null;

  return (
    <HideOnPath paths={['/bind-roster']}>
      <div className="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-600/30 bg-amber-600/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <span>
            您還沒有填寫學號與姓名，建議先填寫方便日後對帳與取貨核對身分（不影響現在下單）。
          </span>
          <Link href="/bind-roster" className="shrink-0 font-medium underline">
            前往填寫
          </Link>
        </div>
      </div>
    </HideOnPath>
  );
}
