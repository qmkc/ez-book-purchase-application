import Link from 'next/link';

import { requireRole } from '@/lib/auth/session';

const NAV = [
  { href: '/admin', label: '總覽' },
  { href: '/admin/batches', label: '預購梯次' },
  { href: '/admin/books', label: '書籍' },
  { href: '/admin/roster', label: '學生名冊' },
  { href: '/admin/audit-log', label: '稽核紀錄' },
];

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  await requireRole('admin');

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-10 sm:flex-row">
      <nav className="flex shrink-0 gap-2 sm:w-40 sm:flex-col">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-black/4 hover:text-black dark:text-zinc-400 dark:hover:bg-white/6 dark:hover:text-white"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
