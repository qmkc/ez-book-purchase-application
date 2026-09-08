import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { BatchForm } from '@/components/batch-form';
import { MuiProviders } from '@/components/mui-providers';
import { db, schema } from '@/db';
import { requireBatchStaffAccess } from '@/lib/batch/batch-access';

import { updateBatch } from '@/app/admin/batches/actions';

export default async function StaffEditBatchPage({
  params,
}: PageProps<'/staff/batches/[batchId]/edit'>) {
  const { batchId } = await params;
  await requireBatchStaffAccess(batchId);

  const [batch] = await db
    .select()
    .from(schema.preorderBatch)
    .where(eq(schema.preorderBatch.id, batchId))
    .limit(1);
  if (!batch) notFound();

  return (
    <MuiProviders>
      <div>
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">
          編輯梯次
        </h1>
        <BatchForm
          action={updateBatch.bind(null, batchId)}
          defaults={batch}
          submitLabel="儲存變更"
        />
      </div>
    </MuiProviders>
  );
}
