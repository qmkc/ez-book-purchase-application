import Link from 'next/link';
import {
  and,
  count,
  desc,
  ilike,
  isNotNull,
  isNull,
  lte,
  or,
} from 'drizzle-orm';

import { db, schema } from '@/db';
import { formatDateTime } from '@/lib/format';
import {
  checkAndNotifyStaleClaims,
  REMINDER_THRESHOLD_DAYS,
} from '@/lib/roster/roster-notifications';

import { ImportForm } from './import-form';
import { NotifyStaleButton } from './notify-stale-button';
import { RosterFilters } from './roster-filters';
import { UnverifyClaimButton } from './unverify-claim-button';
import { VerifyClaimForm } from './verify-claim-form';

const CLAIM_METHOD_LABEL: Record<string, string> = {
  data: '資料比對',
  email: '學校信箱驗證',
};

const PAGE_SIZE = 50;

function isOverdue(claimedAt: Date | null, verifiedAt: Date | null) {
  if (!claimedAt || verifiedAt) return false;
  const days = (Date.now() - claimedAt.getTime()) / (24 * 60 * 60 * 1000);
  return days >= REMINDER_THRESHOLD_DAYS;
}

function getOverdueBefore() {
  return new Date(Date.now() - REMINDER_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
}

export default async function AdminRosterPage({
  searchParams,
}: PageProps<'/admin/roster'>) {
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.trim() : '';
  const status = typeof params.status === 'string' ? params.status : 'all';
  const page = Math.max(1, Number(params.page) || 1);

  try {
    await checkAndNotifyStaleClaims();
  } catch (err) {
    console.error('checkAndNotifyStaleClaims failed on page load', err);
  }

  const overdueBefore = getOverdueBefore();

  const conditions = [
    q
      ? or(
          ilike(schema.studentRoster.studentId, `%${q}%`),
          ilike(schema.studentRoster.realName, `%${q}%`),
        )
      : undefined,
    status === 'unbound'
      ? isNull(schema.studentRoster.claimedByUserId)
      : undefined,
    status === 'unverified'
      ? and(
          isNotNull(schema.studentRoster.claimedAt),
          isNull(schema.studentRoster.verifiedAt),
        )
      : undefined,
    status === 'overdue'
      ? and(
          isNotNull(schema.studentRoster.claimedAt),
          isNull(schema.studentRoster.verifiedAt),
          lte(schema.studentRoster.claimedAt, overdueBefore),
        )
      : undefined,
    status === 'verified'
      ? isNotNull(schema.studentRoster.verifiedAt)
      : undefined,
  ].filter(Boolean);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db.query.studentRoster.findMany({
      where,
      orderBy: desc(schema.studentRoster.updatedAt),
      with: { claimedByUser: true },
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    db.select({ total: count() }).from(schema.studentRoster).where(where),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(targetPage: number) {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (status !== 'all') sp.set('status', status);
    if (targetPage > 1) sp.set('page', String(targetPage));
    const qs = sp.toString();
    return qs ? `/admin/roster?${qs}` : '/admin/roster';
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">學生名冊</h1>

      <div className="mb-8 rounded-xl border border-black/10 p-5 dark:border-white/15">
        <h2 className="mb-3 font-medium">批次匯入</h2>
        <ImportForm />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-medium">
            名冊列表（共 {total} 筆
            {q || status !== 'all' ? '，符合篩選條件' : ''}）
          </h2>
          <p className="text-xs text-zinc-500">
            學生綁定不要求一定要對上匯入資料才能成功，未核實不影響下單；超過{' '}
            {REMINDER_THRESHOLD_DAYS}{' '}
            天仍未核實會自動寄提醒信給學生本人與管理員。
          </p>
        </div>
        <NotifyStaleButton />
      </div>

      <RosterFilters initialQuery={q} initialStatus={status} />

      <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/15">
        <table className="w-full min-w-160 text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-zinc-500 dark:border-white/15">
              <th className="px-4 py-2 font-normal">學號</th>
              <th className="px-4 py-2 font-normal">姓名</th>
              <th className="px-4 py-2 font-normal">綁定狀態</th>
              <th className="px-4 py-2 font-normal">核實</th>
              <th className="px-4 py-2 font-normal">更新時間</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                  沒有符合搜尋/篩選條件的名冊資料。
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-black/5 last:border-0 dark:border-white/10"
                >
                  <td className="px-4 py-2">{row.studentId}</td>
                  <td className="px-4 py-2">{row.realName}</td>
                  <td className="px-4 py-2">
                    {row.claimedByUser ? (
                      <span className="text-green-700 dark:text-green-400">
                        已綁定（{row.claimedByUser.email}） ·{' '}
                        {row.claimMethod
                          ? CLAIM_METHOD_LABEL[row.claimMethod]
                          : '未知'}
                        {!row.importedBy && (
                          <span className="ml-1 text-zinc-500">
                            （自報建立）
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-zinc-500">尚未綁定</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {!row.claimedAt ? (
                      <span className="text-zinc-400">—</span>
                    ) : row.verifiedAt ? (
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-green-700 dark:text-green-400">
                          已核實（{formatDateTime(row.verifiedAt)}）
                        </span>
                        <UnverifyClaimButton rosterId={row.id} />
                      </div>
                    ) : (
                      <div className="flex flex-col items-start gap-1">
                        {isOverdue(row.claimedAt, row.verifiedAt) && (
                          <span className="rounded-full bg-red-600/10 px-2 py-0.5 text-xs text-red-700 dark:text-red-400">
                            逾期未核實
                          </span>
                        )}
                        <VerifyClaimForm
                          rosterId={row.id}
                          studentId={row.studentId}
                          realName={row.realName}
                        />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">
                    {formatDateTime(row.updatedAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <Link
            href={pageHref(page - 1)}
            aria-disabled={page <= 1}
            className={`rounded-full border px-3 py-1 ${
              page <= 1
                ? 'pointer-events-none border-black/10 text-zinc-400 dark:border-white/10'
                : 'border-black/15 hover:bg-black/4 dark:border-white/20 dark:hover:bg-white/6'
            }`}
          >
            上一頁
          </Link>
          <span className="text-zinc-500">
            第 {page} / {totalPages} 頁
          </span>
          <Link
            href={pageHref(page + 1)}
            aria-disabled={page >= totalPages}
            className={`rounded-full border px-3 py-1 ${
              page >= totalPages
                ? 'pointer-events-none border-black/10 text-zinc-400 dark:border-white/10'
                : 'border-black/15 hover:bg-black/4 dark:border-white/20 dark:hover:bg-white/6'
            }`}
          >
            下一頁
          </Link>
        </div>
      )}
    </div>
  );
}
