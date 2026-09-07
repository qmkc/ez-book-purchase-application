'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import QRCode from 'qrcode';

export function QrCodeDisplay({
  getToken,
}: {
  getToken: () => Promise<{ token?: string; error?: string }>;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const result = await getToken();
    if (result.error) {
      setError(result.error);
      setDataUrl(null);
      return;
    }

    if (result.token) {
      setError(null);
      const url = await QRCode.toDataURL(result.token, {
        margin: 1,
        width: 240,
      });
      setDataUrl(url);
    }
  }, [getToken]);

  useEffect(() => {
    startTransition(refresh);

    const interval = setInterval(() => startTransition(refresh), 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (error) {
    return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  }

  if (!dataUrl) {
    return <p className="text-sm text-zinc-500">代碼產生中…</p>;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={dataUrl}
        alt="訂單核對代碼"
        width={240}
        height={240}
        className="rounded-lg border border-black/10 dark:border-white/15"
      />
      <p className="text-xs text-zinc-500">
        請將此 QR code 出示給承辦人員核對，代碼每分鐘會自動更新
      </p>
    </div>
  );
}
