import { BatchForm } from '@/components/batch-form';
import { MuiProviders } from '@/components/mui-providers';

import { createBatch } from '@/app/admin/batches/actions';

export default function StaffNewBatchPage() {
  return (
    <MuiProviders>
      <div>
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">
          新增梯次
        </h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          建立後您會自動成為此梯次的承辦人員（負責人）。
        </p>
        <BatchForm action={createBatch} submitLabel="建立梯次" />
      </div>
    </MuiProviders>
  );
}
