'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { GoogleSignInButton } from '@/components/google-signin-button';
import { authClient } from '@/lib/auth/auth-client';

export function LoginForm() {
  const router = useRouter();
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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message ?? '登入失敗，請確認帳號密碼是否正確');
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">登入</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          密碼
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
          />
        </label>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {submitting ? '登入中…' : '登入'}
        </button>
      </form>
      <div className="my-6 flex items-center gap-3 text-xs text-zinc-500">
        <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
        或
        <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
      </div>
      <GoogleSignInButton label="使用 Google 登入" />
      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        還沒有帳號？{' '}
        <Link href="/signup" className="font-medium text-foreground underline">
          註冊
        </Link>
      </p>
    </main>
  );
}
