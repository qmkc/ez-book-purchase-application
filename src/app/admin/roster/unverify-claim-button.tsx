'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';

import { unverifyRosterClaim } from './actions';

export function UnverifyClaimButton({ rosterId }: { rosterId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await unverifyRosterClaim(rosterId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-zinc-500 underline hover:text-red-600 dark:hover:text-red-400"
      >
        取消核實
      </button>
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <ConfirmDialog
        open={confirming}
        title="取消核實"
        description="確定要把這筆名冊資料撥回「已綁定但未核實」嗎？綁定關係本身不會受影響，之後可以再重新核實一次。"
        confirmLabel="確定取消核實"
        onConfirm={handleConfirm}
        onCancel={() => setConfirming(false)}
        pending={pending}
      />
    </>
  );
}
