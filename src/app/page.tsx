import Link from 'next/link';

import { getCurrentSession } from '@/lib/auth/session';

export default async function Home() {
  const session = await getCurrentSession();

  if (!session) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          校園教科書團購預購系統
        </h1>
        <p className="max-w-md text-zinc-600 dark:text-zinc-400">
          登入後即可瀏覽開放中的預購梯次、下單購買教科書，並用學生帳號查看訂單與取貨進度。
        </p>
        <div className="flex gap-3">
          <Link
            href="/login"
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            登入
          </Link>
          <Link
            href="/signup"
            className="rounded-full border border-black/10 px-5 py-2.5 text-sm font-medium hover:bg-black/4 dark:border-white/15 dark:hover:bg-white/6"
          >
            註冊帳號
          </Link>
        </div>
      </main>
    );
  }

  const role = session.user.role as string;

  const cards: { href: string; title: string; description: string }[] = [];
  if (role === 'student') {
    cards.push(
      {
        href: '/batches',
        title: '瀏覽預購梯次',
        description: '查看目前開放的團購梯次與書籍。',
      },
      {
        href: '/orders',
        title: '我的訂單',
        description: '查看訂單狀態、付款與取貨進度。',
      },
    );
  }
  if (role === 'staff' || role === 'admin') {
    cards.push({
      href: '/staff',
      title: '承辦作業',
      description: '標記付款/取貨、查詢梯次訂單。',
    });
  }
  if (role === 'admin') {
    cards.push({
      href: '/admin',
      title: '後台管理',
      description: '管理梯次、書籍與學生名冊。',
    });
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">
        歡迎回來，{session.user.name}
      </h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-xl border border-black/10 p-5 transition-colors hover:bg-black/3 dark:border-white/15 dark:hover:bg-white/5"
          >
            <h2 className="font-medium">{card.title}</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              {card.description}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
