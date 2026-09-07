'use client';

import { useState } from 'react';

import { authClient } from '@/lib/auth/auth-client';

export function GoogleSignInButton({
  label,
  callbackURL = '/',
}: {
  label: string;
  // 已有帳號的人登入完成後要導去哪裡（例如 /login?next=... 帶進來的頁面）。
  callbackURL?: string;
}) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    // better-auth 會導去 Google 走完整個 OAuth 流程，成功後導回 callbackURL；
    // 這裡不需要自己處理回傳結果。
    //
    // email/password 註冊完成後會被導去 /bind-roster 補學號綁定，但社群登入
    // （Google 等 OAuth2）在這之前不管是不是第一次登入都直接導去 callbackURL，
    // 從沒被要求過綁定身分。用 newUserCallbackURL 讓 better-auth 幫忙判斷
    // 「這次登入是不是順便建立了新帳號」——是的話才導去 /bind-roster，
    // 已經有帳號的人登入不受影響，行為對齊 email/password 那邊。
    await authClient.signIn.social({
      provider: 'google',
      callbackURL,
      newUserCallbackURL: '/bind-roster',
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="flex items-center justify-center gap-2 rounded-full border border-black/15 px-5 py-2.5 text-sm font-medium hover:bg-black/4 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/6"
    >
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
      {pending ? '前往 Google 登入…' : label}
    </button>
  );
}
