'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { authClient } from '@/lib/auth/auth-client';
import type { RosterVerificationStatus } from '@/lib/roster/roster-lookup';

type HeaderUser = {
  name: string;
  role: string;
  rosterStatus: RosterVerificationStatus;
};

// 預購梯次不開放瀏覽/搜尋，只能透過梯次負責人提供的網址進入，所以導覽列不
// 放「預購梯次」這個連結——避免讓人以為這裡可以逛到所有開放中的梯次。
const NAV_LINKS: Record<string, { href: string; label: string }[]> = {
  student: [{ href: '/orders', label: '我的訂單' }],
  staff: [
    { href: '/staff', label: '承辦作業' },
    { href: '/orders', label: '我的訂單' },
  ],
  admin: [
    { href: '/admin', label: '後台管理' },
    { href: '/staff', label: '承辦作業' },
    { href: '/orders', label: '我的訂單' },
  ],
};

export function Header({ user }: { user: HeaderUser | null }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await authClient.signOut();
    router.push('/login');
    router.refresh();
  }

  const links = user ? (NAV_LINKS[user.role] ?? []) : [];

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      {/* flex-wrap 而不是硬擠成一行：手機上標題＋導覽連結＋使用者資訊全部塞
          同一行很容易爆版，換行排列比較不會在窄螢幕上溢出。使用者姓名在小
          螢幕上先隱藏（只留登出鈕），進一步減少寬度壓力。 */}
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="font-semibold tracking-tight">
          校園教科書團購
        </Link>
        <nav className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        {user ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden items-center gap-1.5 text-zinc-500 sm:inline-flex">
              {user.name}
              {/* 「填了但還沒核實」只在這裡小小提醒一下就好，不用整條大警告
                  （見 RosterReminderBanner 的說明）——使用者自己該做的事已經
                  做完了，只是在等管理員。 */}
              {user.rosterStatus === 'unverified' && (
                <Link
                  href="/bind-roster"
                  className="text-amber-700 underline dark:text-amber-400"
                >
                  學號待核實
                </Link>
              )}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="rounded-full border border-black/10 px-3 py-1 text-xs hover:bg-black/4 disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/6"
            >
              {signingOut ? '登出中…' : '登出'}
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="rounded-full bg-foreground px-4 py-1.5 text-sm text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            登入
          </Link>
        )}
      </div>
    </header>
  );
}
