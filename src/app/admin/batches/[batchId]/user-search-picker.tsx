'use client';

import { useEffect, useRef, useState } from 'react';

import { XMarkIcon } from '@/components/icons';

import { searchUsersForStaffAssignment } from '../actions';

type UserResult = { id: string; name: string; email: string; role: string };

const ROLE_LABEL: Record<string, string> = {
  admin: '管理員',
  staff: '承辦人員',
  student: '學生',
};

// 新增承辦人員用的小型使用者搜尋：輸入姓名或 email 就會debounce搜尋、列出
// 符合的帳號，點一下選定，不用先知道對方完整的 email 才能新增。
export function UserSearchPicker({
  batchId,
  selected,
  onSelect,
}: {
  batchId: string;
  selected: UserResult | null;
  onSelect: (user: UserResult | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const trimmed = query.trim();
      if (!trimmed) {
        setResults([]);
        return;
      }
      setSearching(true);
      const rows = await searchUsersForStaffAssignment(batchId, trimmed);
      setResults(rows);
      setSearching(false);
      setOpen(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, batchId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/20">
        <span>
          {selected.name}（{selected.email}）
        </span>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="text-zinc-500 hover:text-red-600"
          aria-label="清除選擇"
        >
          <XMarkIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-56">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="輸入姓名或 email 搜尋"
        autoComplete="off"
        className="w-full rounded-md border border-black/15 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
      />
      {open && (
        <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-black/10 bg-zinc-50 py-1 shadow-lg dark:border-white/15 dark:bg-zinc-900">
          {searching ? (
            <li className="px-3 py-1.5 text-xs text-zinc-500">搜尋中…</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-1.5 text-xs text-zinc-500">
              沒有符合的使用者
            </li>
          ) : (
            results.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(user);
                    setQuery('');
                    setResults([]);
                    setOpen(false);
                  }}
                  className="flex w-full flex-col items-start px-3 py-1.5 text-left text-sm hover:bg-black/4 dark:hover:bg-white/6"
                >
                  <span>{user.name}</span>
                  <span className="text-xs text-zinc-500">
                    {user.email} · {ROLE_LABEL[user.role] ?? user.role}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
