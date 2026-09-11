import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, desc, eq, notInArray } from 'drizzle-orm';

import { BatchStatsPanel } from '@/components/batch-stats-panel';
import { ManageBooks } from '@/components/manage-books';
import { MuiProviders } from '@/components/mui-providers';
import { SharePageQr } from '@/components/share-page-qr';
import { StatusButtons } from '@/components/status-buttons';
import { db, schema } from '@/db';
import { getBatchStats } from '@/lib/batch/batch-catalog';
import { requireBatchStaffAccess } from '@/lib/batch/batch-access';
import { getRosterInfoByUserIds } from '@/lib/roster/roster-lookup';

import { OrdersTable } from './orders-table';

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  open: '開放中',
  closed: '已結束',
};

export default async function StaffBatchDetailPage({
  params,
}: PageProps<'/staff/batches/[batchId]'>) {
  const { batchId } = await params;
  await requireBatchStaffAccess(batchId);

  const [batch] = await db
    .select()
    .from(schema.preorderBatch)
    .where(eq(schema.preorderBatch.id, batchId))
    .limit(1);
  if (!batch) notFound();

  const [orders, stats, batchBooksRaw] = await Promise.all([
    db.query.preorder.findMany({
      where: eq(schema.preorder.batchId, batchId),
      orderBy: desc(schema.preorder.createdAt),
      with: { user: true },
    }),
    getBatchStats(batchId),
    db.query.preorderBatchBook.findMany({
      where: eq(schema.preorderBatchBook.batchId, batchId),
      with: {
        book: true,
        priceTiers: {
          orderBy: asc(schema.preorderBatchBookPriceTier.minQuantity),
        },
      },
    }),
  ]);

  const rosterByUserId = await getRosterInfoByUserIds(
    orders.map((order) => order.userId),
  );

  const usedBookIds = batchBooksRaw.map((b) => b.bookId);
  const availableBooks = await db
    .select({
      id: schema.book.id,
      title: schema.book.title,
      isbn: schema.book.isbn,
      author: schema.book.author,
      publisher: schema.book.publisher,
    })
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
    isbn: b.book.isbn,
    author: b.book.author,
    publisher: b.book.publisher,
    quantityLimit: b.quantityLimit,
    isActive: b.isActive,
    tiers: b.priceTiers,
  }));

  return (
    <MuiProviders>
      <div>
        <div className="mb-1 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight wrap-break-word">
              {batch.name}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {STATUS_LABEL[batch.status] ?? batch.status}
            </p>
          </div>
          <div className="flex shrink-0 flex-row flex-wrap gap-2 sm:flex-col sm:items-end">
            <Link
              href={`/staff/batches/${batchId}/scan`}
              className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              掃描核對
            </Link>
            <StatusButtons batchId={batch.id} status={batch.status} />
            <SharePageQr label="分享加入連結" path={`/batches/${batchId}`} />
            <Link
              href={`/staff/batches/${batchId}/edit`}
              className="rounded-full border border-black/15 px-3 py-1 text-xs hover:bg-black/4 dark:border-white/20 dark:hover:bg-white/6"
            >
              編輯梯次資訊
            </Link>
          </div>
        </div>
        <p className="mb-6 text-sm text-zinc-500">共 {orders.length} 筆訂單</p>

        <div className="mb-6">
          <BatchStatsPanel stats={stats} />
        </div>

        <section className="mb-10">
          <h2 className="mb-3 text-lg font-medium">開放預購書籍</h2>
          <ManageBooks
            batchId={batchId}
            batchBooks={batchBooks}
            availableBooks={availableBooks}
            newBookHref={`/staff/books/new?batchId=${batchId}`}
          />
        </section>

        <OrdersTable
          batchId={batchId}
          orders={orders.map((order) => {
            const roster = rosterByUserId.get(order.userId);
            return {
              id: order.id,
              studentName: order.user.name,
              realName: roster?.realName ?? null,
              studentEmail: order.user.email,
              studentId: roster?.studentId ?? null,
              rosterVerificationStatus: roster?.verificationStatus ?? 'unbound',
              totalAmount: order.totalAmount,
              paymentStatus: order.paymentStatus,
              pickupStatus: order.pickupStatus,
              cancelledAt: order.cancelledAt,
              createdAt: order.createdAt,
            };
          })}
        />
      </div>
    </MuiProviders>
  );
}
