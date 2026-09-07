'use client';

import { useActionState, useState } from 'react';

import { verifyRosterClaim } from './actions';

export function VerifyClaimForm({
  rosterId,
  studentId,
  realName,
}: {
  rosterId: string;
  studentId: string;
  realName: string;
}) {
  const [open, setOpen] = useState(false);
  const action = verifyRosterClaim.bind(null, rosterId);
  const [state, formAction, pending] = useActionState(action, undefined);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-black/15 px-3 py-1 text-xs hover:bg-black/4 dark:border-white/20 dark:hover:bg-white/6"
      >
        核實
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <input
          name="studentId"
          defaultValue={studentId}
          className="w-28 rounded-md border border-black/15 bg-transparent px-2 py-1 text-xs outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
        />
        <input
          name="realName"
          defaultValue={realName}
          className="w-24 rounded-md border border-black/15 bg-transparent px-2 py-1 text-xs outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {pending ? '確認中…' : '確認核實'}
        </button>
      </div>
      {state?.error && (
        <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>
      )}
    </form>
  );
}
