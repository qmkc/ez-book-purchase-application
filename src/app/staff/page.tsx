import Link from 'next/link';
import { desc, inArray } from 'drizzle-orm';

import { CourseInfo } from '@/components/course-info';
import { db, schema } from '@/db';
import { formatBatchPeriod } from '@/lib/format';
import { listAccessibleBatchIds } from '@/lib/batch/batch-access';
import { getOrdererCountsByBatchIds } from '@/lib/batch/batch-catalog';
import { requireRole } from '@/lib/auth/session';

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  open: '開放中',
  closed: '已結束',
};

export default async function StaffHomePage() {
  const session = await requireRole(['staff', 'admin']);
  const accessibleIds = await listAccessibleBatchIds(
    session.user.id,
    session.user.role as string,
  );

  const batches =
    accessibleIds === null
      ? await db
          .select()
          .from(schema.preorderBatch)
          .orderBy(desc(schema.preorderBatch.createdAt))
      : accessibleIds.length === 0
        ? []
        : await db
            .select()
            .from(schema.preorderBatch)
            .where(inArray(schema.preorderBatch.id, accessibleIds))
            .orderBy(desc(schema.preorderBatch.createdAt));

  const ordererCounts = await getOrdererCountsByBatchIds(
    batches.map((b) => b.id),
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">承辦作業</h1>
        <Link
          href="/staff/batches/new"
          className="shrink-0 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          新增梯次
        </Link>
      </div>
      {batches.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          目前沒有您可以承辦的梯次，可以點選右上角「新增梯次」自行建立，或請系統管理員指派權限。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {batches.map((batch) => (
            <li key={batch.id}>
              <Link
                href={`/staff/batches/${batch.id}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-black/10 p-4 transition-colors hover:bg-black/3 dark:border-white/15 dark:hover:bg-white/5"
              >
                <div>
                  <p className="font-medium">{batch.name}</p>
                  <CourseInfo batch={batch} />
                  <p className="text-xs text-zinc-500">
                    {formatBatchPeriod(batch.startAt, batch.endAt)}
                    {(ordererCounts.get(batch.id) ?? 0) > 0 &&
                      ` · ${ordererCounts.get(batch.id)} 人已預購`}
                  </p>
                </div>
                <span className="text-sm text-zinc-500">
                  {STATUS_LABEL[batch.status] ?? batch.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
