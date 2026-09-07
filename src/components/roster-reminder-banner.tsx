import Link from 'next/link';

import { isRosterBound } from '@/lib/auth/session';

// 軟提醒：學號綁定不影響下單，只是提醒使用者順手填一下，方便之後對帳/取貨核對身分。
export async function RosterReminderBanner({ userId }: { userId: string }) {
  if (await isRosterBound(userId)) return null;

  return (
    <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-amber-600/30 bg-amber-600/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
      <span>
        您還沒有填寫學號與姓名，建議先填寫方便日後對帳與取貨核對身分（不影響現在下單）。
      </span>
      <Link href="/bind-roster" className="shrink-0 font-medium underline">
        前往填寫
      </Link>
    </div>
  );
}
