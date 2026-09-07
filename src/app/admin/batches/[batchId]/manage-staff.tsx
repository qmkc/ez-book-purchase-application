'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState, useTransition } from 'react';

import { addBatchStaff, removeBatchStaff } from '../actions';
import { UserSearchPicker } from './user-search-picker';

type StaffRow = {
  id: string;
  role: string;
  userId: string;
  name: string;
  email: string;
};

export function ManageStaff({
  batchId,
  staff,
}: {
  batchId: string;
  staff: StaffRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const addAction = addBatchStaff.bind(null, batchId);
  const [state, formAction, addPending] = useActionState(addAction, undefined);
  const [selectedUser, setSelectedUser] = useState<{
    id: string;
    name: string;
    email: string;
    role: string;
  } | null>(null);

  useEffect(() => {
    if (state?.success) {
      startTransition(() => setSelectedUser(null));
    }
  }, [state, startTransition]);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {staff.length === 0 && (
          <li className="text-sm text-zinc-500">尚未指派承辦人員。</li>
        )}
        {staff.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/15"
          >
            <span>
              {row.name}（{row.email}） ·{' '}
              {row.role === 'owner' ? '負責人' : '協助人員'}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await removeBatchStaff(row.id, batchId);
                  router.refresh();
                })
              }
              className="text-xs text-zinc-500 hover:text-red-600"
            >
              移除
            </button>
          </li>
        ))}
      </ul>

      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="userId" value={selectedUser?.id ?? ''} />
        <label className="flex flex-col gap-1 text-xs">
          使用者
          <UserSearchPicker
            batchId={batchId}
            selected={selectedUser}
            onSelect={setSelectedUser}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          角色
          <select
            name="role"
            className="rounded-md border border-black/15 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
          >
            <option value="assistant">協助人員</option>
            <option value="owner">負責人</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={addPending || !selectedUser}
          className="rounded-full border border-black/15 px-3 py-1.5 text-xs hover:bg-black/4 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/6"
        >
          {addPending ? '新增中…' : '新增承辦人員'}
        </button>
      </form>
      {state?.error && (
        <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>
      )}
    </div>
  );
}
