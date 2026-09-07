import { eq } from 'drizzle-orm';

import { db, schema } from '@/db';
import { parseStudentIdFromSchoolEmail } from '@/lib/roster/school';
import { requireSession } from '@/lib/auth/session';

import { RosterForm } from './roster-form';
import { SchoolEmailBind } from './school-email-bind';

export default async function BindRosterPage() {
  const session = await requireSession('/bind-roster');

  const [claimed] = await db
    .select({ id: schema.studentRoster.id })
    .from(schema.studentRoster)
    .where(eq(schema.studentRoster.claimedByUserId, session.user.id))
    .limit(1);

  // 登入 email 剛好符合學校信箱格式的話，先幫忙帶入，使用者仍可以改填別的
  // 信箱（例如登入 email 是自己的 Google 帳號、學校信箱是另一個）。
  const prefillEmail = parseStudentIdFromSchoolEmail(session.user.email)
    ? session.user.email
    : '';

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">
        綁定學生身分
      </h1>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        方便日後對帳與取貨核對身分用，不影響現在下單。就算暫時找不到對應的匯入資料也能先填，
        管理員會之後再人工核實。
      </p>
      {claimed ? (
        <p className="rounded-md border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
          此帳號已完成學生身分綁定。
        </p>
      ) : (
        <>
          {/* 學號與姓名手動綁定放最前面、預設引導的路徑——立即完成，不用等信；
              學校信箱驗證雖然核實等級較高，但收信/寄信常常有延遲，改放下面
              當作「想要更高保證」的人再用的次要選項。兩者都只是軟性核實，
              不影響下單，見 requireSession/isRosterBound 的說明。 */}
          <p className="mb-2 text-sm font-medium">使用學號與姓名綁定</p>
          <p className="mb-4 text-xs text-zinc-500">
            請輸入您的學號與真實姓名，不需要跟學校匯入的資料完全相符也能先綁定，之後由管理員人工核實。
          </p>
          <RosterForm />
          <div className="my-6 flex items-center gap-3 text-xs text-zinc-500">
            <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
            或
            <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
          </div>
          <SchoolEmailBind defaultEmail={prefillEmail} />
        </>
      )}
    </main>
  );
}
