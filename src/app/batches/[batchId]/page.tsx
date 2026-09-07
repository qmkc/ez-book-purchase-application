import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { CourseInfo } from '@/components/course-info';
import { db, schema } from '@/db';
import {
  getActiveBatchBooks,
  getBatchOrdererCount,
  getCumulativeQuantities,
} from '@/lib/batch/batch-catalog';
import { formatBatchPeriod, formatTWD } from '@/lib/format';
import { resolveTierPrice } from '@/lib/batch/pricing';
import { requireSession } from '@/lib/auth/session';

import { OrderForm } from './order-form';

export default async function BatchDetailPage({
  params,
}: PageProps<'/batches/[batchId]'>) {
  const { batchId } = await params;
  await requireSession(`/batches/${batchId}`);

  const [batch] = await db
    .select()
    .from(schema.preorderBatch)
    .where(eq(schema.preorderBatch.id, batchId))
    .limit(1);
  if (!batch) notFound();

  const [batchBooks, cumulative, ordererCount] = await Promise.all([
    getActiveBatchBooks(batchId),
    getCumulativeQuantities(batchId),
    getBatchOrdererCount(batchId),
  ]);

  const books = batchBooks.map((batchBook) => {
    const alreadyOrdered = cumulative.get(batchBook.bookId) ?? 0;
    const nextUnitPrice = resolveTierPrice(
      batchBook.priceTiers,
      alreadyOrdered + 1,
    );
    return {
      batchBookId: batchBook.id,
      bookId: batchBook.bookId,
      title: batchBook.book.title,
      author: batchBook.book.author,
      coverImageUrl: batchBook.book.coverImageUrl,
      listPrice: batchBook.book.listPrice,
      quantityLimit: batchBook.quantityLimit,
      alreadyOrdered,
      nextUnitPrice,
      tiers: batchBook.priceTiers.map((t) => ({
        minQuantity: t.minQuantity,
        price: t.price,
      })),
    };
  });

  const isOpen = batch.status === 'open';

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{batch.name}</h1>
      {batch.description && (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {batch.description}
        </p>
      )}
      <CourseInfo batch={batch} />
      <p className="mt-2 text-xs text-zinc-500">
        預購期間：{formatBatchPeriod(batch.startAt, batch.endAt)}
        {ordererCount > 0 && ` · 目前已有 ${ordererCount} 人預購`}
      </p>

      {!isOpen && (
        <p className="mt-6 rounded-md border border-amber-600/30 bg-amber-600/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          此梯次目前未開放預購。
        </p>
      )}

      {books.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          此梯次尚未開放任何書籍預購。
        </p>
      ) : isOpen ? (
        <OrderForm batchId={batchId} books={books} />
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {books.map((book) => (
            <li
              key={book.batchBookId}
              className="rounded-xl border border-black/10 p-4 dark:border-white/15"
            >
              <p className="font-medium">{book.title}</p>
              <p className="text-sm text-zinc-500">
                建議售價 {formatTWD(book.listPrice)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
