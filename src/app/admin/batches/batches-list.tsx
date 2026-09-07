'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { formatBatchPeriod } from '@/lib/format';

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  open: '開放中',
  closed: '已結束',
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'draft', label: '草稿' },
  { value: 'open', label: '開放中' },
  { value: 'closed', label: '已結束' },
];

type BatchRow = {
  id: string;
  name: string;
  status: string;
  startAt: string | Date;
  endAt: string | Date | null;
  instructorName: string | null;
  courseCode: string | null;
  location: string | null;
  classSchedule: string | null;
  ordererCount: number;
};

export function BatchesList({ batches }: { batches: BatchRow[] }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredBatches = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return batches.filter((batch) => {
      if (statusFilter !== 'all' && batch.status !== statusFilter) return false;
      if (!keyword) return true;
      const haystack = [
        batch.name,
        batch.instructorName,
        batch.courseCode,
        batch.location,
        batch.classSchedule,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [batches, search, statusFilter]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋梯次名稱、老師、課號、地點"
          className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 sm:max-w-xs dark:border-white/20 dark:focus:border-white/50"
        />
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                statusFilter === filter.value
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-black/15 text-zinc-600 hover:bg-black/4 dark:border-white/20 dark:text-zinc-400 dark:hover:bg-white/6'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {filteredBatches.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          沒有符合搜尋/篩選條件的梯次。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filteredBatches.map((batch) => (
            <li key={batch.id}>
              <Link
                href={`/admin/batches/${batch.id}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-black/10 p-4 transition-colors hover:bg-black/3 dark:border-white/15 dark:hover:bg-white/5"
              >
                <div>
                  <p className="font-medium">{batch.name}</p>
                  {(batch.instructorName || batch.courseCode) && (
                    <p className="text-xs text-zinc-500">
                      {[
                        batch.instructorName,
                        batch.courseCode && `課號 ${batch.courseCode}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                  <p className="text-xs text-zinc-500">
                    {formatBatchPeriod(batch.startAt, batch.endAt)}
                    {batch.ordererCount > 0 &&
                      ` · ${batch.ordererCount} 人已預購`}
                  </p>
                </div>
                <span className="text-sm text-zinc-500">
                  {STATUS_LABEL[batch.status] ?? batch.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
