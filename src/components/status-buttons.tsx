'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { updateBatchStatus } from '../actions';

const TRANSITIONS: Record<
  string,
  { status: 'draft' | 'open' | 'closed'; label: string }[]
> = {
  draft: [{ status: 'open', label: '開放預購' }],
  open: [{ status: 'closed', label: '結束梯次' }],
  closed: [{ status: 'open', label: '重新開放' }],
};

export function StatusButtons({
  batchId,
  status,
}: {
  batchId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const options = TRANSITIONS[status] ?? [];

  return (
    <div className="flex gap-2">
      {options.map((option) => (
        <button
          key={option.status}
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await updateBatchStatus(batchId, option.status);
              router.refresh();
            })
          }
          className="rounded-full border border-black/15 px-4 py-1.5 text-sm hover:bg-black/4 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/6"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
