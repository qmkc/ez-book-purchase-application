import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import { Header } from '@/components/header';
import { VerifyEmailBanner } from '@/components/verify-email-banner';
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
        {session && !session.user.emailVerified && (
          <div className="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6">
            <VerifyEmailBanner email={session.user.email} />
          </div>
        )}
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
