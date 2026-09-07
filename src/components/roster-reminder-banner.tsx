import Link from 'next/link';

import { getRosterInfoByUserId } from '@/lib/roster/roster-lookup';

import { HideOnPath } from './hide-on-path';

// 軟提醒：學號綁定不影響下單，只是提醒使用者順手填一下，方便之後對帳/
// 取貨核對身分。只有「完全沒填」才提醒——填了但還在等管理員核實不算使用者
// 還欠什麼，不需要另外顯示什麼。放在 root layout，不限特定頁面——
// /bind-roster 本身已經在做這件事，疊一層提醒反而多餘，用 HideOnPath 擋掉。
export async function RosterReminderBanner({ userId }: { userId: string }) {
  const roster = await getRosterInfoByUserId(userId);
  const status = roster?.verificationStatus ?? 'unbound';
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
