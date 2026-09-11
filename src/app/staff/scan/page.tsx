import Link from 'next/link';

import { MuiProviders } from '@/components/mui-providers';

import { getScannableBatches } from './actions';
import { ScanWidget } from './scan-widget';

export default async function StaffCombinedScanPage() {
  const batches = await getScannableBatches();

  return (
    <MuiProviders>
      <div>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold tracking-tight">
            聯合掃描核對
          </h1>
          <Link
            href="/staff"
            className="shrink-0 text-sm text-zinc-500 underline"
          >
            回到承辦作業
          </Link>
        </div>
        <ScanWidget batches={batches} />
      </div>
    </MuiProviders>
  );
}
