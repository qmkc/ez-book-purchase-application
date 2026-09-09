'use client';

import { useActionState, useState } from 'react';

import { sendSchoolEmailBindOtp, verifySchoolEmailBindOtp } from './actions';
import { BindSuccessMessage } from './bind-success-message';

export function SchoolEmailBind({
  defaultEmail,
  next,
}: {
  defaultEmail: string;
  next: string;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [otpSent, setOtpSent] = useState(false);

  const [sendState, sendAction, sendPending] = useActionState(
    async (
      prev: { error?: string; sent?: boolean } | undefined,
      formData: FormData,
    ) => {
      const result = await sendSchoolEmailBindOtp(prev, formData);
      if (result.sent) setOtpSent(true);
      return result;
    },
    undefined,
  );
  const [verifyState, verifyAction, verifyPending] = useActionState(
    verifySchoolEmailBindOtp,
    undefined,
  );

  if (verifyState?.success) {
    return <BindSuccessMessage matched={verifyState.matched} next={next} />;
  }

  return (
    <div className="mb-6 rounded-xl border border-black/10 p-4 dark:border-white/15">
      <p className="mb-1 text-sm font-medium">使用學校信箱綁定（最高級驗證）</p>
      <p className="mb-3 text-xs text-zinc-500">
        輸入您的學校信箱（{'{學號}'}
        @nfu.edu.tw）學校信箱的驗證信寄送會有「嚴重」延遲，若不想等信，上面的學號與姓名綁定就能立即完成。
      </p>

      {!otpSent ? (
        <form action={sendAction} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            學校信箱
            <input
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="1234567@nfu.edu.tw"
              className="w-56 rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
            />
          </label>
          <button
            type="submit"
            disabled={sendPending}
            className="rounded-full border border-black/15 px-4 py-2 text-sm hover:bg-black/4 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/6"
          >
            {sendPending ? '寄送中…' : '寄送驗證碼'}
          </button>
          {sendState?.error && (
            <p className="w-full text-sm text-red-600 dark:text-red-400">
              {sendState.error}
            </p>
          )}
        </form>
      ) : (
        <form action={verifyAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="email" value={email} />
          <p className="w-full text-xs text-zinc-500">已寄送驗證碼到 {email}</p>
          <label className="flex flex-col gap-1 text-sm">
            驗證碼
            <input
              name="code"
              required
              autoComplete="one-time-code"
              className="w-32 rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
            />
          </label>
          <button
            type="submit"
            disabled={verifyPending}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {verifyPending ? '驗證中…' : '驗證並綁定'}
          </button>
          <button
            type="button"
            onClick={() => setOtpSent(false)}
            className="text-xs text-zinc-500 underline"
          >
            重新寄送 / 改用其他信箱
          </button>
          {verifyState?.error && (
            <p className="w-full text-sm text-red-600 dark:text-red-400">
              {verifyState.error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
