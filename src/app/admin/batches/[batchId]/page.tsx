import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq, notInArray } from 'drizzle-orm';

import { BatchStatsPanel } from '@/components/batch-stats-panel';
import { CourseInfo } from '@/components/course-info';
import { SharePageQr } from '@/components/share-page-qr';
import { db, schema } from '@/db';
import { getBatchStats } from '@/lib/batch/batch-catalog';
import { formatBatchPeriod } from '@/lib/format';

import { ManageBooks } from './manage-books';
import { ManageStaff } from './manage-staff';
import { StatusButtons } from './status-buttons';

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  open: '開放中',
  closed: '已結束',
};

export default async function AdminBatchDetailPage({
  params,
}: PageProps<'/admin/batches/[batchId]'>) {
  const { batchId } = await params;

  const [batch] = await db
    .select()
    .from(schema.preorderBatch)
    .where(eq(schema.preorderBatch.id, batchId))
    .limit(1);
  if (!batch) notFound();

  const [batchBooksRaw, staffRows, stats] = await Promise.all([
    db.query.preorderBatchBook.findMany({
      where: eq(schema.preorderBatchBook.batchId, batchId),
      with: {
        book: true,
        priceTiers: {
          orderBy: asc(schema.preorderBatchBookPriceTier.minQuantity),
        },
      },
    }),
    db.query.preorderBatchStaff.findMany({
      where: eq(schema.preorderBatchStaff.batchId, batchId),
      with: { user: true },
    }),
    getBatchStats(batchId),
  ]);

  const usedBookIds = batchBooksRaw.map((b) => b.bookId);
  const availableBooks = await db
    .select({ id: schema.book.id, title: schema.book.title })
    .from(schema.book)
    .where(
      usedBookIds.length > 0
        ? notInArray(schema.book.id, usedBookIds)
        : undefined,
    )
    .orderBy(asc(schema.book.title));

  const batchBooks = batchBooksRaw.map((b) => ({
    id: b.id,
    bookId: b.bookId,
    title: b.book.title,
    quantityLimit: b.quantityLimit,
    isActive: b.isActive,
    tiers: b.priceTiers,
  }));

  const staff = staffRows.map((row) => ({
    id: row.id,
    role: row.role,
    userId: row.userId,
    name: row.user.name,
    email: row.user.email,
  }));

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight wrap-break-word">
            {batch.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {formatBatchPeriod(batch.startAt, batch.endAt)} ·{' '}
            {STATUS_LABEL[batch.status] ?? batch.status}
          </p>
          <CourseInfo batch={batch} />
        </div>
        <div className="flex shrink-0 flex-row flex-wrap gap-2 sm:flex-col sm:items-end">
          <StatusButtons batchId={batch.id} status={batch.status} />
          <SharePageQr label="分享學生預購連結" path={`/batches/${batch.id}`} />
          <Link
            href={`/admin/batches/${batch.id}/edit`}
            className="rounded-full border border-black/15 px-3 py-1 text-xs hover:bg-black/4 dark:border-white/20 dark:hover:bg-white/6"
          >
            編輯梯次資訊
          </Link>
        </div>
      </div>

      <section className="mb-10">
        <BatchStatsPanel stats={stats} />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">開放預購書籍</h2>
        <ManageBooks
          batchId={batch.id}
          batchBooks={batchBooks}
          availableBooks={availableBooks}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">承辦人員</h2>
        <p className="mb-3 text-xs text-zinc-500">
          只有列在這裡的人員（或系統管理員）可以標記此梯次訂單的付款/取貨狀態。
        </p>
        <ManageStaff batchId={batch.id} staff={staff} />
      </section>
    </div>
  );
}
