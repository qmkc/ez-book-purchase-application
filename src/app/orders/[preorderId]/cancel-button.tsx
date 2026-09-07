'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { cancelOwnPreorder } from './actions';

export function CancelOrderButton({ preorderId }: { preorderId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm('確定要取消此訂單嗎？')) return;
    startTransition(async () => {
      const result = await cancelOwnPreorder(preorderId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-full border border-red-600/40 px-4 py-1.5 text-sm text-red-600 hover:bg-red-600/10 disabled:opacity-50 dark:text-red-400"
      >
        {pending ? '取消中…' : '取消訂單'}
      </button>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
