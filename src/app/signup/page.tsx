'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { GoogleSignInButton } from '@/components/google-signin-button';
import { authClient } from '@/lib/auth/auth-client';

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signUpError } = await authClient.signUp.email({
      name,
      email,
      password,
    });
    setSubmitting(false);
    if (signUpError) {
      setError(signUpError.message ?? '註冊失敗，請稍後再試');
      return;
    }
    router.push('/bind-roster');
    router.refresh();
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">註冊帳號</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          姓名
          <input
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
          />
        </label>
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
            minLength={8}
            autoComplete="new-password"
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
          {submitting ? '註冊中…' : '註冊'}
        </button>
      </form>
      <div className="my-6 flex items-center gap-3 text-xs text-zinc-500">
        <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
        或
        <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
      </div>
      <GoogleSignInButton label="使用 Google 註冊" />
      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        已經有帳號了？{' '}
        <Link href="/login" className="font-medium text-foreground underline">
          登入
        </Link>
      </p>
    </main>
  );
}
