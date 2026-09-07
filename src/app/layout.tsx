import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import { Header } from '@/components/header';
import { getCurrentSession } from '@/lib/auth/session';

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

  return (
    <html
      lang="zh-TW"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 dark:bg-black">
        <Header
          user={
            session
              ? { name: session.user.name, role: session.user.role as string }
              : null
          }
        />
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
