import Link from 'next/link';
import { desc } from 'drizzle-orm';

import { db, schema } from '@/db';
import { getOrdererCountsByBatchIds } from '@/lib/batch/batch-catalog';

import { BatchesList } from './batches-list';

export default async function AdminBatchesPage() {
  const batchRows = await db
    .select()
    .from(schema.preorderBatch)
    .orderBy(desc(schema.preorderBatch.createdAt));

  const ordererCounts = await getOrdererCountsByBatchIds(
    batchRows.map((b) => b.id),
  );
  const batches = batchRows.map((batch) => ({
    ...batch,
    ordererCount: ordererCounts.get(batch.id) ?? 0,
  }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">預購梯次</h1>
        <Link
          href="/admin/batches/new"
          className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          新增梯次
        </Link>
      </div>
      {batches.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          還沒有任何梯次。
        </p>
      ) : (
        <BatchesList batches={batches} />
      )}
    </div>
  );
}
