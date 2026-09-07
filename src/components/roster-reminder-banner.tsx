import Link from 'next/link';

import { getRosterInfoByUserId } from '@/lib/roster/roster-lookup';

import { HideOnPath } from './hide-on-path';

// 軟提醒：學號綁定/核實都不影響下單，只是提醒使用者順手填一下、或告知還在
// 等管理員核實，方便之後對帳/取貨核對身分。放在 root layout，只要還沒核實
// （不管是完全沒填，還是填了但管理員還沒核對）就會出現，不限特定頁面——
// /bind-roster 本身已經在做這件事，疊一層提醒反而多餘，用 HideOnPath 擋掉。
export async function RosterReminderBanner({ userId }: { userId: string }) {
  const roster = await getRosterInfoByUserId(userId);
  const status = roster?.verificationStatus ?? 'unbound';
  if (status === 'verified') return null;

  return (
    <HideOnPath paths={['/bind-roster']}>
      <div className="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-600/30 bg-amber-600/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          {status === 'unbound' ? (
            <span>
              您還沒有填寫學號與姓名，建議先填寫方便日後對帳與取貨核對身分（不影響現在下單）。
            </span>
          ) : (
            <span>
              您填寫的學號與姓名還在等管理員核實，不影響現在下單，核實前建議先確認資料是否填寫正確。
            </span>
          )}
          <Link href="/bind-roster" className="shrink-0 font-medium underline">
            {status === 'unbound' ? '前往填寫' : '查看綁定資料'}
          </Link>
        </div>
      </div>
    </HideOnPath>
  );
}
