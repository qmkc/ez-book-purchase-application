import { MuiProviders } from '@/components/mui-providers';

import { createBatch } from '../actions';
import { BatchForm } from '../batch-form';

export default function NewBatchPage() {
  return (
    <MuiProviders>
      <div>
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">新增梯次</h1>
        <BatchForm action={createBatch} submitLabel="建立梯次" />
      </div>
    </MuiProviders>
  );
}
