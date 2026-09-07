import Link from 'next/link';

import { requireSession } from '@/lib/auth/session';

// 預購梯次不開放公開瀏覽/搜尋，只能透過梯次負責人提供的連結（或分享出來的
// QR code）直接進入 /batches/[batchId]，這裡就不列出任何梯次清單了。
export default async function BatchesPage() {
  await requireSession('/batches');

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">預購梯次</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        預購梯次不提供瀏覽或搜尋，請使用梯次負責人（老師或承辦人員）提供的連結或
        QR code 進入對應的預購頁面。
      </p>
      <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        已經下過的訂單可以到
        <Link href="/orders" className="mx-1 underline">
          我的訂單
        </Link>
        查看。
      </p>
    </main>
  );
}
