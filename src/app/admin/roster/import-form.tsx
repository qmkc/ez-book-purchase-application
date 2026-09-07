'use client';

import { useActionState } from 'react';

import { importRoster } from './actions';

export function ImportForm() {
  const [state, formAction, pending] = useActionState(importRoster, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        每行一筆，格式為「學號,真實姓名」
        <textarea
          name="rows"
          rows={6}
          required
          placeholder={'B10912345,王小明\nB10912346,陳小華'}
          className="rounded-md border border-black/15 bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
        />
      </label>
      {state?.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {state?.imported !== undefined && (
        <p className="text-sm text-green-700 dark:text-green-400">
          已匯入/更新 {state.imported} 筆資料
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {pending ? '匯入中…' : '匯入'}
      </button>
    </form>
  );
}
