'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'unbound', label: '尚未綁定' },
  { value: 'unverified', label: '已綁定未核實' },
  { value: 'overdue', label: '逾期未核實' },
  { value: 'verified', label: '已核實' },
];

export function RosterFilters({
  initialQuery,
  initialStatus,
}: {
  initialQuery: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);

  function navigate(next: { q?: string; status?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    const q = next.q ?? initialQuery;
    const status = next.status ?? initialStatus;
    if (q) params.set('q', q);
    else params.delete('q');
    if (status && status !== 'all') params.set('status', status);
    else params.delete('status');
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    if (query === initialQuery) return;

    const timer = setTimeout(() => navigate({ q: query }), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜尋學號或姓名"
        className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 sm:max-w-xs dark:border-white/20 dark:focus:border-white/50"
      />
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => navigate({ status: filter.value })}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              initialStatus === filter.value
                ? 'border-foreground bg-foreground text-background'
                : 'border-black/15 text-zinc-600 hover:bg-black/4 dark:border-white/20 dark:text-zinc-400 dark:hover:bg-white/6'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  );
}
