'use client';

import { useActionState } from 'react';

import { bindRoster } from './actions';
import { BindSuccessMessage } from './bind-success-message';

export function RosterForm() {
  const [state, formAction, pending] = useActionState(bindRoster, undefined);

  if (state?.success) {
    return <BindSuccessMessage matched={state.matched} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        學號
        <input
          name="studentId"
          required
          autoComplete="off"
          className="rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        真實姓名
        <input
          name="realName"
          required
          autoComplete="off"
          className="rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
        />
      </label>
      {state?.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {pending ? '確認中…' : '完成綁定'}
      </button>
    </form>
  );
}
