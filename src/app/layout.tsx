import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import { Header } from '@/components/header';
import { RosterReminderBanner } from '@/components/roster-reminder-banner';
import { getCurrentSession } from '@/lib/auth/session';
import { getRosterInfoByUserId } from '@/lib/roster/roster-lookup';

import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: '校園教科書團購',
  description: '校園教科書團購預購系統',
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const session = await getCurrentSession();
  // 查一次給 Header（姓名旁邊的小提示）跟 RosterReminderBanner（完全沒填時
  // 的大警告框）共用，不要兩邊各自查一次 DB、還可能查出不一致的結果。
  const rosterStatus = session
    ? ((await getRosterInfoByUserId(session.user.id))?.verificationStatus ??
      'unbound')
    : null;

  return (
    <html
      lang="zh-TW"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 dark:bg-black">
        <Header
          user={
            session && rosterStatus
              ? {
                  name: session.user.name,
                  role: session.user.role as string,
                  rosterStatus,
                }
              : null
          }
        />
        {rosterStatus && <RosterReminderBanner status={rosterStatus} />}
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
