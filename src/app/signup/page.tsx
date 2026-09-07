import Link from 'next/link';

import { GoogleOneTapPrompt } from '@/components/google-one-tap-prompt';
import { SocialSignInButton } from '@/components/social-sign-in-button';

export default function SignupPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      {/* 新帳號沒有既有 Google session 可以 auto-select 時，One Tap 大多不會
          顯示任何東西，這裡加上去單純是「有的話就順手用」，不是這個頁面的
          主要登入路徑——主要路徑一律是下面那幾顆按鈕。 */}
      <GoogleOneTapPrompt callbackURL="/bind-roster" />
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">註冊帳號</h1>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        使用下列帳號註冊，第一次登入會直接建立帳號，不需要另外設密碼。
      </p>
      <div className="flex flex-col gap-2">
        <SocialSignInButton provider="google" label="使用 Google 註冊" />
        <SocialSignInButton provider="github" label="使用 GitHub 註冊" />
        <SocialSignInButton provider="discord" label="使用 Discord 註冊" />
      </div>
      <p className="mt-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        已經有帳號了？{' '}
        <Link href="/login" className="font-medium text-foreground underline">
          登入
        </Link>
      </p>
    </main>
  );
}
