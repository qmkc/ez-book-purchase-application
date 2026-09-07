import Link from 'next/link';
import { desc } from 'drizzle-orm';

import { db, schema } from '@/db';

import { BatchesList } from './batches-list';

export default async function AdminBatchesPage() {
  const batches = await db
    .select()
    .from(schema.preorderBatch)
    .orderBy(desc(schema.preorderBatch.createdAt));

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
