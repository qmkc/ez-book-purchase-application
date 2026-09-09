'use client';

import { useState } from 'react';

import { authClient } from '@/lib/auth/auth-client';

export type SocialProvider = 'google' | 'github' | 'discord';

// Google 官方品牌規範要求登入鈕用他們的彩色 G 圖示；GitHub/Discord 對第三方
// 登入鈕沒有這種強制規定，這裡統一用 currentColor 畫成單色，跟按鈕本身的
// 邊框/文字顏色一致（深色模式會自動跟著換色），比硬塞三種不同風格的圖示
// 看起來一致。
const ICONS: Record<SocialProvider, React.ReactNode> = {
  google: (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.4-.1-2.7-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.6 15.1 18.9 12 24 12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 5.1 29.6 3 24 3c-7.5 0-14 4.2-17.7 10.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 45c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 35.6 26.9 36.5 24 36.5c-5.3 0-9.7-2.6-11.3-7l-6.6 5.1C9.9 40.6 16.4 45 24 45z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.6 5.6C41.4 36.1 44 30.5 44 24c0-1.4-.1-2.7-.4-3.5z"
      />
    </svg>
  ),
  github: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55v-1.94c-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.75 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.8 1.18 1.83 1.18 3.09 0 4.43-2.7 5.4-5.27 5.68.42.36.78 1.08.78 2.17v3.22c0 .3.2.66.79.55A10.52 10.52 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
    </svg>
  ),
  discord: (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.955 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418Z" />
    </svg>
  ),
};

export function SocialSignInButton({
  provider,
  label,
  callbackURL = '/',
  newUserCallbackURL = '/bind-roster',
}: {
  provider: SocialProvider;
  label: string;
  // 已有帳號的人登入完成後要導去哪裡（例如 /login?next=... 帶進來的頁面）。
  callbackURL?: string;
  // 新帳號登入完成後要導去哪裡；預設 /bind-roster 補學號綁定。呼叫端
  // （目前是 /login）可以在後面帶上 ?next=...，讓 /bind-roster 完成後
  // 接著導回使用者原本要去的頁面，而不是悄悄掉回首頁。
  newUserCallbackURL?: string;
}) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    // better-auth 會導去該 provider 走完整個 OAuth 流程，成功後導回
    // callbackURL；這裡不需要自己處理回傳結果。
    //
    // 用 newUserCallbackURL 讓 better-auth 幫忙判斷「這次登入是不是順便建立
    // 了新帳號」——是的話導去 newUserCallbackURL（預設 /bind-roster）補學號
    // 綁定；已經有帳號的人登入則照舊導去 callbackURL，不會被多打斷一次。
    await authClient.signIn.social({
      provider,
      callbackURL,
      newUserCallbackURL,
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="flex items-center justify-center gap-2 rounded-full border border-black/15 px-5 py-2.5 text-sm font-medium hover:bg-black/4 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/6"
    >
      {ICONS[provider]}
      {pending ? '前往登入…' : label}
    </button>
  );
}
