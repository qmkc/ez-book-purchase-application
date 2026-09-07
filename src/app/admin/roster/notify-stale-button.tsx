'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { triggerStaleClaimsCheck } from './actions';

export function NotifyStaleButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleClick() {
    setMessage(null);
    startTransition(async () => {
      const result = await triggerStaleClaimsCheck();
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setMessage(
        result.checked === 0
          ? '目前沒有逾期未核實的資料'
          : `已檢查 ${result.checked} 筆逾期未核實資料，寄出 ${result.notified} 筆提醒信`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-full border border-black/15 px-3 py-1.5 text-xs hover:bg-black/4 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/6"
      >
        {pending ? '檢查中…' : '立即檢查逾期未核實並寄信'}
      </button>
      {message && <span className="text-xs text-zinc-500">{message}</span>}
    </div>
  );
}
