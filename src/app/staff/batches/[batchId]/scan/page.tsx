import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { db, schema } from '@/db';
import { requireBatchStaffAccess } from '@/lib/batch/batch-access';

import { ScanWidget } from '../scan-widget';

export default async function StaffScanPage({
  params,
}: PageProps<'/staff/batches/[batchId]/scan'>) {
  const { batchId } = await params;
  await requireBatchStaffAccess(batchId);

  const [batch] = await db
    .select({ name: schema.preorderBatch.name })
    .from(schema.preorderBatch)
    .where(eq(schema.preorderBatch.id, batchId))
    .limit(1);
  if (!batch) notFound();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-xs text-zinc-500">{batch.name}</p>
          <h1 className="text-lg font-semibold tracking-tight">掃描核對</h1>
        </div>
        <Link
          href={`/staff/batches/${batchId}`}
          className="shrink-0 text-sm text-zinc-500 underline"
        >
          回到梯次管理
        </Link>
      </div>
      <ScanWidget batchId={batchId} fullscreen />
    </div>
  );
}
