'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { GoogleOneTapPrompt } from '@/components/google-one-tap-prompt';
import { SocialSignInButton } from '@/components/social-sign-in-button';
import { sanitizeNextPath } from '@/lib/safe-next-path';

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = sanitizeNextPath(searchParams.get('next'));
  const newUserCallbackURL = `/bind-roster?next=${encodeURIComponent(next)}`;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <GoogleOneTapPrompt callbackURL={next} />
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">登入</h1>
      <div className="flex flex-col gap-2">
        <SocialSignInButton
          provider="google"
          label="使用 Google 登入"
          callbackURL={next}
          newUserCallbackURL={newUserCallbackURL}
        />
        <SocialSignInButton
          provider="github"
          label="使用 GitHub 登入"
          callbackURL={next}
          newUserCallbackURL={newUserCallbackURL}
        />
        <SocialSignInButton
          provider="discord"
          label="使用 Discord 登入"
          callbackURL={next}
          newUserCallbackURL={newUserCallbackURL}
        />
      </div>
      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        還沒有帳號？{' '}
        <Link href="/signup" className="font-medium text-foreground underline">
          註冊
        </Link>
      </p>
    </main>
  );
}
