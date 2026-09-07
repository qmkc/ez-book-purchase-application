'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { GoogleOneTapPrompt } from '@/components/google-one-tap-prompt';
import { GoogleSignInButton } from '@/components/google-signin-button';

export function LoginForm() {
  const searchParams = useSearchParams();
  const rawNext = searchParams.get('next');
  // 只接受站內相對路徑：擋掉絕對網址（https://evil.com）跟 protocol-relative
  // 網址（//evil.com，瀏覽器會當成外部網域），避免登入後導頁被用來做
  // open redirect。「/」開頭但緊接著第二個「/」或「\」也一併擋，那樣的字串
  // 一樣會被瀏覽器解析成外部網址。
  const next =
    rawNext &&
    rawNext.startsWith('/') &&
    !rawNext.startsWith('//') &&
    !rawNext.startsWith('/\\')
      ? rawNext
      : '/';

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <GoogleOneTapPrompt callbackURL={next} />
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">登入</h1>
      <GoogleSignInButton label="使用 Google 登入" callbackURL={next} />
      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        還沒有帳號？{' '}
        <Link href="/signup" className="font-medium text-foreground underline">
          註冊
        </Link>
      </p>
    </main>
  );
}
