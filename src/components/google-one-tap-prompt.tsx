'use client';

import { useEffect } from 'react';

import { authClient } from '@/lib/auth/auth-client';

// Google One Tap：一進登入/註冊頁就嘗試彈出「用 xxx@gmail.com 繼續」的小
// 提示，瀏覽器本來就有 Google session 的人不用手動點下面的 Google 按鈕。
//
// One Tap 的 callback 只吃單一個 callbackURL（不像 GoogleSignInButton 用的
// signIn.social 那樣有 newUserCallbackURL 可以把新帳號導去 /bind-roster），
// 所以這裡固定導去呼叫端指定的頁面；如果因此順便建立了新帳號卻沒被導去
// /bind-roster，之後在梯次頁還是會看到 RosterReminderBanner 的軟提醒，
// 不影響下單，不算功能缺口。
//
// 完全被動：Google 沒有既有 session、瀏覽器擋第三方 cookie、使用者先前關過
// 提示……任何原因沒跳出提示都靜默放棄，使用者還是能用旁邊的按鈕正常登入。
export function GoogleOneTapPrompt({
  callbackURL = '/',
}: {
  callbackURL?: string;
}) {
  useEffect(() => {
    authClient.oneTap({ callbackURL }).catch(() => {});
    // 只在掛載時嘗試一次，callbackURL 在這兩個頁面掛載後不會變。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
