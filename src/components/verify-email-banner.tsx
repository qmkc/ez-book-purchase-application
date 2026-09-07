'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { authClient } from '@/lib/auth/auth-client';
import { verifyLoginEmail } from '@/lib/auth/verify-email-actions';
import { CheckCircleIcon, ExclamationTriangleIcon } from '@/components/icons';

// 額外的、非強制的登入 Email 驗證：跟學號綁定一樣走「軟提醒」路線，不驗證
// 也完全不影響任何操作。註冊時系統已經自動寄過一次驗證碼（見 auth.ts 的
// sendVerificationOnSignUp），這裡主要是給沒收到信/信件過期的人一個補救、
// 之後隨時可以完成驗證的入口。
export function VerifyEmailBanner({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSend() {
    setSending(true);
    setError(null);
    const { error: sendError } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: 'email-verification',
    });
    setSending(false);
    if (sendError) {
      setError(sendError.message ?? '驗證碼寄送失敗，請稍後再試');
      return;
    }
    setSent(true);
  }

  async function handleVerify(formData: FormData) {
    const code = String(formData.get('otp') ?? '').trim();
    if (!code) return;
    setVerifying(true);
    setError(null);
    const result = await verifyLoginEmail(email, code);
    setVerifying(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <div className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-600/30 bg-emerald-600/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300">
        <CheckCircleIcon className="h-4 w-4 shrink-0" />
        <span>Email 驗證成功！</span>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-amber-600/30 bg-amber-600/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
          <span className="min-w-0 wrap-break-word">
            您的登入 Email（{email}）尚未驗證，建議完成驗證以加強帳號安全性。
          </span>
        </span>
        {!open && (
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              if (!sent) void handleSend();
            }}
            className="shrink-0 rounded-full border border-amber-700/40 px-3 py-1 text-xs font-medium hover:bg-amber-600/10"
          >
            驗證 Email
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 border-t border-amber-700/20 pt-3">
          {sending && !sent ? (
            <p className="text-xs">寄送驗證碼中…</p>
          ) : (
            <>
              {sent && (
                <p className="mb-2 text-xs">
                  驗證碼已寄至 {email}，請輸入 6 位數驗證碼（有效時間內）。
                </p>
              )}
              <form
                action={handleVerify}
                className="flex flex-wrap items-center gap-2"
              >
                <input
                  name="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="驗證碼"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-32 rounded-md border border-amber-700/30 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-amber-700/60"
                />
                <button
                  type="submit"
                  disabled={verifying || !otp}
                  className="rounded-full bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-50 dark:bg-amber-600 dark:hover:bg-amber-700"
                >
                  {verifying ? '驗證中…' : '確認驗證'}
                </button>
                <button
                  type="button"
                  disabled={sending}
                  onClick={handleSend}
                  className="text-xs underline disabled:opacity-50"
                >
                  {sending ? '寄送中…' : '重新發送驗證碼'}
                </button>
              </form>
            </>
          )}
          {error && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
