'use client';

import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';
import { Alert, Collapse } from '@mui/material';

import { BoltIcon, CheckCircleIcon } from '@/components/icons';
import ErrorIcon from '@mui/icons-material/Error';

enum ScanState {
  Idle = 'idle',
  Success = 'success',
  Error = 'error',
}

// 常數配置
const CONFIG = {
  MAX_DECODE_WIDTH: 480,
  DECODE_INTERVAL_MS: 150,
  POST_SCAN_COOLDOWN_MS: 700,
  SCAN_DEBOUNCE_MS: 350,
} as const;

// 狀態樣式映射
const SCAN_STATE_STYLES = {
  [ScanState.Idle]: {
    borderColor: 'border-cyan-400/70',
    shadowColor: 'rgba(34, 211, 238, 0.15)',
    animate: true,
  },
  [ScanState.Success]: {
    borderColor: 'border-emerald-400',
    shadowColor: 'rgba(52, 211, 153, 0.3)',
    animate: false,
  },
  [ScanState.Error]: {
    borderColor: 'border-red-400',
    shadowColor: 'rgba(248, 113, 113, 0.3)',
    animate: false,
  },
} as const;

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };
type TorchConstraintSet = MediaTrackConstraintSet & { torch?: boolean };

interface QrCameraScannerProps {
  onScan: (text: string) => void;
  onScanCheck?: (text: string) => boolean | undefined;
  onClose: () => void;
  paused?: boolean;
  large?: boolean;
}

export function QrCameraScanner({
  onScan,
  onScanCheck,
  onClose,
  paused = false,
  large = false,
}: QrCameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [scanState, setScanState] = useState<ScanState>(ScanState.Idle);

  // 引用追蹤
  const pausedRef = useRef(paused);
  const lastAttemptRef = useRef(0);
  const cooldownUntilRef = useRef(0);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // 初始化相機
  useEffect(() => {
    let cancelled = false;
    let frameId: number;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;

        if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
          await new Promise<void>((resolve) => {
            const handler = () => {
              video.removeEventListener('loadedmetadata', handler);
              resolve();
            };
            video.addEventListener('loadedmetadata', handler);
          });
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        try {
          await video.play();
        } catch (err) {
          console.warn('video.play() failed:', err);
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        setReady(true);

        // 檢查手電筒支持
        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as
          | TorchCapabilities
          | undefined;
        if (caps?.torch) setTorchSupported(true);

        frameId = requestAnimationFrame(tick);
      } catch (err) {
        console.error('Camera initialization failed:', err);
        if (!cancelled) {
          setError('無法開啟相機。請檢查瀏覽器權限設定，或使用手動輸入模式。');
        }
      }
    }

    let lastScannedData: string | null = null;
    let lastEqAt = 0;

    function tick(now: number) {
      frameId = requestAnimationFrame(tick);

      if (
        pausedRef.current ||
        now < cooldownUntilRef.current ||
        now - lastAttemptRef.current < CONFIG.DECODE_INTERVAL_MS
      ) {
        return;
      }

      lastAttemptRef.current = now;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < video.HAVE_ENOUGH_DATA) {
        return;
      }

      const scale = Math.min(1, CONFIG.MAX_DECODE_WIDTH / video.videoWidth);
      const width = Math.round(video.videoWidth * scale);
      const height = Math.round(video.videoHeight * scale);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const data =
        jsQR(imageData.data, width, height, { inversionAttempts: 'dontInvert' })
          ?.data ?? null;

      if (!data) return;

      setScanState(ScanState.Idle);
      cooldownUntilRef.current = now + CONFIG.POST_SCAN_COOLDOWN_MS;

      if (
        data === lastScannedData &&
        now - lastEqAt < CONFIG.SCAN_DEBOUNCE_MS
      ) {
        return;
      }
      lastEqAt = now;
      lastScannedData = data;

      const checkResult = onScanCheck?.(data) ?? true;
      if (checkResult) {
        setScanState(ScanState.Success);
        onScan(data);
        setTimeout(() => setScanState(ScanState.Idle), 500);
      } else {
        setScanState(ScanState.Error);
        setTimeout(() => setScanState(ScanState.Idle), 600);
      }
    }

    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    const constraint: TorchConstraintSet = { torch: next };
    track.applyConstraints({ advanced: [constraint] }).then(
      () => setTorchOn(next),
      () => setTorchSupported(false),
    );
  }

  const styles = SCAN_STATE_STYLES[scanState];

  return (
    <div
      className={
        large
          ? 'flex flex-col items-center gap-4'
          : 'flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950'
      }
    >
      <div className="flex w-full items-center justify-between gap-3">
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {paused
              ? '已讀取代碼，核對完會自動繼續掃描下一位'
              : '將 QR code 對準框內'}
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
        >
          關閉相機
        </button>
      </div>

      <div
        className={`relative mx-auto w-full max-h-[70dvh] overflow-hidden bg-slate-950 ${
          large
            ? 'max-w-md aspect-3/4 rounded-2xl'
            : 'aspect-square max-w-xs rounded-xl'
        }`}
      >
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          muted
        />

        {!ready && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-300">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
            <span className="text-sm font-medium">開啟相機中…</span>
          </div>
        )}

        {ready && !error && (
          <ScanFrameOverlay
            scanState={scanState}
            paused={paused}
            styles={styles}
          />
        )}

        {ready && torchSupported && (
          <button
            type="button"
            onClick={toggleTorch}
            aria-pressed={torchOn}
            aria-label={torchOn ? '關閉手電筒' : '開啟手電筒'}
            className={`absolute right-4 bottom-4 flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-sm transition-all ${
              torchOn
                ? 'bg-amber-400/90 text-slate-950 shadow-lg shadow-amber-400/50'
                : 'bg-black/40 text-white hover:bg-black/60'
            }`}
          >
            <BoltIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* 成功提示 */}
      <Collapse in={scanState === ScanState.Success} className="w-full">
        <Alert
          severity="success"
          icon={<CheckCircleIcon className="h-5 w-5" />}
          className="border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-200"
        >
          <span className="font-medium">QR code 驗證成功</span>
        </Alert>
      </Collapse>

      {/* 失敗提示 */}
      <Collapse in={scanState === ScanState.Error} className="w-full">
        <Alert
          severity="error"
          icon={<ErrorIcon className="h-5 w-5" />}
          className="border-red-200 bg-red-50 text-red-800 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-200"
        >
          <span className="font-medium">QR code 無效或內容不符</span>
        </Alert>
      </Collapse>

      <style>{`
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          50% { transform: translateY(100%); }
          100% { transform: translateY(-100%); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        @keyframes pop-in {
          0% { transform: scale(0.5); opacity: 0; }
          70% { transform: scale(1.08); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

interface ScanFrameOverlayProps {
  scanState: ScanState;
  paused: boolean;
  styles: (typeof SCAN_STATE_STYLES)[keyof typeof SCAN_STATE_STYLES];
}

function ScanFrameOverlay({
  scanState,
  paused,
  styles,
}: ScanFrameOverlayProps) {
  const isIdle = scanState === ScanState.Idle && !paused;
  const isSuccess = scanState === ScanState.Success;
  const isError = scanState === ScanState.Error;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 transition-all duration-200"
        style={{
          boxShadow: `0 0 0 9999px ${styles.shadowColor}`,
        }}
      />

      {/* 掃描框 */}
      <div
        className={`relative aspect-square w-[62%] max-w-56 transition-all duration-200 ${
          isError ? 'animate-[shake_0.5s_ease-in-out]' : ''
        }`}
      >
        {/* 四個邊角 */}
        {[
          'top-0 left-0 rounded-tl-lg border-t-4 border-l-4',
          'top-0 right-0 rounded-tr-lg border-t-4 border-r-4',
          'bottom-0 left-0 rounded-bl-lg border-b-4 border-l-4',
          'bottom-0 right-0 rounded-br-lg border-b-4 border-r-4',
        ].map((posClass, idx) => (
          <span
            key={idx}
            className={`absolute h-8 w-8 ${posClass} ${styles.borderColor} transition-all duration-200 ${
              isIdle ? 'opacity-100' : isSuccess ? 'opacity-0' : 'opacity-70'
            }`}
          />
        ))}

        {/* 掃描線 */}
        {isIdle && !paused && (
          <span className="absolute inset-x-2 top-1/2 h-1 -translate-y-1/2 animate-[scanline_2s_ease-in-out_infinite] bg-linear-to-r from-transparent via-cyan-400/80 to-transparent shadow-lg shadow-cyan-400/50" />
        )}

        {/* 成功圖示 */}
        {isSuccess && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              animation: 'pop-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            <CheckCircleIcon className="h-12 w-12 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          </div>
        )}

        {/* 失敗圖示 */}
        {isError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-5xl font-bold text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.8)]">
              ✕
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
