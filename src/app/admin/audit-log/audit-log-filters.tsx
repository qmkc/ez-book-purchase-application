'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export function AuditLogFilters({
  initialQuery,
  initialEntityType,
  initialAction,
  entityTypeOptions,
  actionOptions,
}: {
  initialQuery: string;
  initialEntityType: string;
  initialAction: string;
  entityTypeOptions: [string, string][];
  actionOptions: [string, string][];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);

  function navigate(next: {
    q?: string;
    entityType?: string;
    action?: string;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    const q = next.q ?? initialQuery;
    const entityType = next.entityType ?? initialEntityType;
    const action = next.action ?? initialAction;
    if (q) params.set('q', q);
    else params.delete('q');
    if (entityType && entityType !== 'all')
      params.set('entityType', entityType);
    else params.delete('entityType');
    if (action && action !== 'all') params.set('action', action);
    else params.delete('action');
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
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜尋對象 ID、操作者姓名或 email"
        className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 sm:max-w-xs dark:border-white/20 dark:focus:border-white/50"
      />
      <select
        value={initialEntityType}
        onChange={(e) => navigate({ entityType: e.target.value })}
        className="w-full max-w-full truncate rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 sm:w-48 dark:border-white/20 dark:focus:border-white/50"
      >
        <option value="all">全部對象類型</option>
        {entityTypeOptions.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <select
        value={initialAction}
        onChange={(e) => navigate({ action: e.target.value })}
        className="w-full max-w-full truncate rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 sm:w-56 dark:border-white/20 dark:focus:border-white/50"
      >
        <option value="all">全部操作類型</option>
        {actionOptions.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
