'use client';

import QRCode from 'qrcode';
import { useEffect, useState, useTransition } from 'react';

export function SharePageQr({
  label = '分享此頁面',
  path,
}: {
  label?: string;
  path?: string;
}) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState('');
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const currentUrl = path
      ? new URL(path, window.location.origin).toString()
      : window.location.href;

    startTransition(() => setUrl(currentUrl));
    QRCode.toDataURL(currentUrl, { margin: 1, width: 200 }).then((generated) =>
      startTransition(() => setDataUrl(generated)),
    );
  }, [open, path]);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full border border-black/15 px-3 py-1.5 text-xs hover:bg-black/4 dark:border-white/20 dark:hover:bg-white/6"
      >
        {label}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 flex w-64 flex-col items-center gap-3 rounded-xl border border-black/10 bg-zinc-50 p-4 shadow-lg dark:border-white/15 dark:bg-zinc-900">
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- 動態產生的 data URL，不透過 next/image 最佳化
            <img
              src={dataUrl}
              alt="此頁面的 QR code"
              width={200}
              height={200}
            />
          ) : (
            <p className="text-xs text-zinc-500">產生中…</p>
          )}
          <p className="break-all text-center text-xs text-zinc-500">{url}</p>
          <button
            type="button"
            onClick={handleCopy}
            className="w-full rounded-full border border-black/15 px-3 py-1.5 text-xs hover:bg-black/4 dark:border-white/20 dark:hover:bg-white/6"
          >
            {copied ? '已複製' : '複製連結'}
          </button>
        </div>
      )}
    </div>
  );
}
