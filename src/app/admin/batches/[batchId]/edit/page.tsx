import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { MuiProviders } from '@/components/mui-providers';
import { db, schema } from '@/db';

import { updateBatch } from '../../actions';
import { BatchForm } from '../../batch-form';

export default async function EditBatchPage({
  params,
}: PageProps<'/admin/batches/[batchId]/edit'>) {
  const { batchId } = await params;

  const [batch] = await db
    .select()
    .from(schema.preorderBatch)
    .where(eq(schema.preorderBatch.id, batchId))
    .limit(1);
  if (!batch) notFound();

  return (
    <MuiProviders>
      <div>
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">編輯梯次</h1>
        <BatchForm
          action={updateBatch.bind(null, batchId)}
          defaults={batch}
          submitLabel="儲存變更"
        />
      </div>
    </MuiProviders>
  );
}
