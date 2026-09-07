'use client';

import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';
import { Alert, Collapse } from '@mui/material';

import { BoltIcon, CheckCircleIcon } from '@/components/icons';
import ErrorIcon from '@mui/icons-material/Error';
import SearchIcon from '@mui/icons-material/Search';

enum ScanState {
  Idle = 'idle',
  Success = 'success',
  Error = 'error',
  NoDetection = 'no-detection',
}

const MAX_DECODE_WIDTH = 480;
const DECODE_INTERVAL_MS = 150;
const POST_SCAN_COOLDOWN_MS = 700;
const NO_DETECTION_TIMEOUT_MS = 5000; // 5秒無檢測後顯示提示

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };
type TorchConstraintSet = MediaTrackConstraintSet & { torch?: boolean };

export function QrCameraScanner({
  onScan,
  onScanCheck,
  onClose,
  paused = false,
  large = false,
}: {
  onScan: (text: string) => void;
  onScanCheck?: (text: string) => boolean | undefined;
  onClose: () => void;
  paused?: boolean;
  large?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // 新增：掃描狀態管理
  const [scanState, setScanState] = useState<ScanState>(ScanState.Idle);
  const [showNoDetectionAlert, setShowNoDetectionAlert] = useState(false);

  const pausedRef = useRef(paused);
  const lastAttemptRef = useRef(0);
  const cooldownUntilRef = useRef(0);
  const lastDetectionRef = useRef<number>(0); // 在 useEffect 中初始化
  const noDetectionTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    let cancelled = false;
    let frameId: number;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
          },
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

        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as
          | TorchCapabilities
          | undefined;

        if (caps?.torch) {
          setTorchSupported(true);
        }

        // 在此初始化 lastDetectionRef（純函數規則）
        lastDetectionRef.current = Date.now();

        // 啟動無檢測計時器
        startNoDetectionTimer();

        frameId = requestAnimationFrame(tick);
      } catch (err) {
        console.error('Camera initialization failed:', err);

        if (!cancelled) {
          setError(
            '無法開啟相機，請確認已允許瀏覽器使用相機權限，或改用手動輸入代碼',
          );
        }
      }
    }

    function startNoDetectionTimer() {
      if (noDetectionTimerRef.current) {
        clearTimeout(noDetectionTimerRef.current);
      }

      noDetectionTimerRef.current = setTimeout(() => {
        const timeSinceLastDetection = Date.now() - lastDetectionRef.current;
        if (timeSinceLastDetection > NO_DETECTION_TIMEOUT_MS && !paused) {
          setScanState(ScanState.NoDetection);
          setShowNoDetectionAlert(true);

          // 動畫顯示2秒後自動隱藏
          setTimeout(() => {
            setShowNoDetectionAlert(false);
            setScanState(ScanState.Idle);
            startNoDetectionTimer(); // 重新開始計時
          }, 2000);
        } else {
          startNoDetectionTimer(); // 重新開始計時
        }
      }, NO_DETECTION_TIMEOUT_MS);
    }

    let lastScannedData: string | null = null;
    function tick(now: number) {
      frameId = requestAnimationFrame(tick);

      if (
        pausedRef.current ||
        now < cooldownUntilRef.current ||
        now - lastAttemptRef.current < DECODE_INTERVAL_MS
      ) {
        return;
      }

      lastAttemptRef.current = now;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < video.HAVE_ENOUGH_DATA) {
        return;
      }

      const scale = Math.min(1, MAX_DECODE_WIDTH / video.videoWidth);
      const width = Math.round(video.videoWidth * scale);
      const height = Math.round(video.videoHeight * scale);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, width, height);

      const imageData = ctx.getImageData(0, 0, width, height);
      const data =
        jsQR(imageData.data, width, height, {
          inversionAttempts: 'dontInvert',
        })?.data ?? null;

      if (!data) {
        lastScannedData = data;
        return;
      }

      lastDetectionRef.current = Date.now();
      setScanState(ScanState.Idle); // 重置為 Idle
      setShowNoDetectionAlert(false);
      cooldownUntilRef.current = now + POST_SCAN_COOLDOWN_MS;

      if (data === lastScannedData) return;
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
      if (noDetectionTimerRef.current) {
        clearTimeout(noDetectionTimerRef.current);
      }
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

  return (
    <div
      className={
        large
          ? 'flex flex-col items-center gap-2'
          : 'flex flex-col items-center gap-2 rounded-xl border border-black/10 p-4 dark:border-white/15'
      }
    >
      <div
        className={`relative w-full overflow-hidden bg-black ${
          large ? 'aspect-3/4 rounded-xl' : 'aspect-square max-w-xs rounded-md'
        }`}
      >
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          muted
        />
        {!ready && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-white">
            開啟相機中…
          </div>
        )}
        {ready && !error && (
          <ScanFrameOverlay scanState={scanState} paused={paused} />
        )}
        {ready && torchSupported && (
          <button
            type="button"
            onClick={toggleTorch}
            aria-pressed={torchOn}
            aria-label={torchOn ? '關閉手電筒' : '開啟手電筒'}
            className={`absolute right-3 bottom-3 flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
              torchOn
                ? 'bg-yellow-400 text-black'
                : 'bg-black/50 text-white hover:bg-black/65'
            }`}
          >
            <BoltIcon className="h-5 w-5" />
          </button>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />

      {/* 成功提示 */}
      <Collapse in={scanState === ScanState.Success}>
        <Alert
          severity="success"
          icon={<CheckCircleIcon className="h-5 w-5" />}
          sx={{
            width: '100%',
            animation: 'slideDown 0.3s ease-out',
            '@keyframes slideDown': {
              from: {
                opacity: 0,
                transform: 'translateY(-10px)',
              },
              to: {
                opacity: 1,
                transform: 'translateY(0)',
              },
            },
          }}
        >
          QR code 驗證成功
        </Alert>
      </Collapse>

      {/* 失敗提示 */}
      <Collapse in={scanState === ScanState.Error}>
        <Alert
          severity="error"
          icon={<ErrorIcon className="h-5 w-5" />}
          sx={{
            width: '100%',
            animation: 'shake 0.5s ease-in-out',
            '@keyframes shake': {
              '0%, 100%': { transform: 'translateX(0)' },
              '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-5px)' },
              '20%, 40%, 60%, 80%': { transform: 'translateX(5px)' },
            },
          }}
        >
          QR code 無效或內容不符，請重新掃描
        </Alert>
      </Collapse>

      {/* 未檢測提示 */}
      <Collapse in={showNoDetectionAlert}>
        <Alert
          severity="info"
          icon={<SearchIcon className="h-5 w-5" />}
          sx={{
            width: '100%',
            animation: 'fadeInUp 0.4s ease-out',
            '@keyframes fadeInUp': {
              from: {
                opacity: 0,
                transform: 'translateY(10px)',
              },
              to: {
                opacity: 1,
                transform: 'translateY(0)',
              },
            },
          }}
        >
          未檢測到 QR code，請確保光線充足並將 QR code 對準框內
        </Alert>
      </Collapse>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <p className="text-xs text-zinc-500">
          {paused
            ? '已讀取代碼，核對完會自動繼續掃描下一位'
            : '將學生出示的 QR code 對準框內'}
        </p>
      )}
      <button
        type="button"
        onClick={onClose}
        className="rounded-full border border-black/15 px-3 py-1 text-xs hover:bg-black/4 dark:border-white/20 dark:hover:bg-white/6"
      >
        關閉相機
      </button>
    </div>
  );
}

function ScanFrameOverlay({
  scanState,
  paused,
}: {
  scanState: ScanState;
  paused: boolean;
}) {
  // 決定邊框顏色和動畫
  let accentColor = 'border-white';
  let frameAnimation = '';
  let scanlineVisible = true;
  let checkmarkVisible = false;
  let errorIconVisible = false;
  let pulseVisible = false;

  switch (scanState) {
    case ScanState.Success:
      accentColor = 'border-green-400';
      frameAnimation = 'scale-110';
      scanlineVisible = false;
      checkmarkVisible = true;
      break;

    case ScanState.Error:
      accentColor = 'border-red-500';
      frameAnimation = 'shake-frame';
      scanlineVisible = false;
      errorIconVisible = true;
      break;

    case ScanState.NoDetection:
      accentColor = 'border-blue-300';
      frameAnimation = '';
      scanlineVisible = false;
      pulseVisible = true;
      break;

    case ScanState.Idle:
    default:
      accentColor = paused ? 'border-zinc-400' : 'border-white';
      frameAnimation = '';
      scanlineVisible = !paused;
      break;
  }

  const isIdle = scanState === ScanState.Idle && !paused;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {/* 背景陰影 */}
      <div
        className="absolute inset-0 transition-colors duration-150"
        style={{
          boxShadow:
            scanState === ScanState.Success
              ? `0 0 0 9999px rgba(34,197,94,0.25)`
              : scanState === ScanState.Error
                ? `0 0 0 9999px rgba(239,68,68,0.25)`
                : scanState === ScanState.NoDetection
                  ? `0 0 0 9999px rgba(59,130,246,0.15)`
                  : `0 0 0 9999px rgba(0,0,0,0.45)`,
        }}
      />

      {/* 掃描框 */}
      <div
        className={`relative aspect-square w-[62%] max-w-56 transition-transform duration-150 ${frameAnimation}`}
        style={{
          animation:
            scanState === ScanState.Error
              ? 'shake-frame 0.5s ease-in-out'
              : scanState === ScanState.NoDetection
                ? 'pulse-frame 1.5s ease-in-out infinite'
                : 'none',
        }}
      >
        {/* 四個邊角 */}
        <span
          className={`absolute top-0 left-0 h-8 w-8 border-t-4 border-l-4 rounded-tl-md transition-colors duration-150 ${accentColor} ${isIdle ? 'animate-[breathe_2s_ease-in-out_infinite]' : ''}`}
        />
        <span
          className={`absolute top-0 right-0 h-8 w-8 border-t-4 border-r-4 rounded-tr-md transition-colors duration-150 ${accentColor} ${isIdle ? 'animate-[breathe_2s_ease-in-out_infinite]' : ''}`}
        />
        <span
          className={`absolute bottom-0 left-0 h-8 w-8 border-b-4 border-l-4 rounded-bl-md transition-colors duration-150 ${accentColor} ${isIdle ? 'animate-[breathe_2s_ease-in-out_infinite]' : ''}`}
        />
        <span
          className={`absolute right-0 bottom-0 h-8 w-8 border-r-4 border-b-4 rounded-br-md transition-colors duration-150 ${accentColor} ${isIdle ? 'animate-[breathe_2s_ease-in-out_infinite]' : ''}`}
        />

        {/* 掃描線 - 正常掃描 */}
        {scanlineVisible && isIdle && (
          <span className="absolute inset-x-1 top-1/2 h-0.5 -translate-y-1/2 animate-[scanline_1.8s_ease-in-out_infinite] bg-green-400/80 shadow-[0_0_6px_1px_rgba(74,222,128,0.7)]" />
        )}

        {/* 成功勾選 */}
        {checkmarkVisible && (
          <span
            className="absolute inset-0 flex items-center justify-center"
            style={{
              animation: 'popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            <CheckCircleIcon className="h-10 w-10 text-green-400 drop-shadow-[0_0_4px_rgba(74,222,128,0.8)]" />
          </span>
        )}

        {/* 失敗 X 圖示 */}
        {errorIconVisible && (
          <span className="absolute inset-0 flex items-center justify-center">
            <div
              style={{
                animation: 'shakeIcon 0.5s ease-in-out',
                fontSize: '2.5rem',
                color: '#ef4444',
                filter: 'drop-shadow(0 0 4px rgba(239,68,68,0.8))',
              }}
            >
              ✕
            </div>
          </span>
        )}

        {/* 未檢測脈動 */}
        {pulseVisible && (
          <span
            className="absolute inset-0 rounded-md border-2 border-blue-300"
            style={{
              animation: 'searchPulse 1.5s ease-in-out infinite',
            }}
          />
        )}
      </div>

      <style>{`
        @keyframes scanline {
          0% { transform: translateY(-90%); }
          50% { transform: translateY(90%); }
          100% { transform: translateY(-90%); }
        }
        @keyframes breathe {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
        @keyframes shake-frame {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
          20%, 40%, 60%, 80% { transform: translateX(8px); }
        }
        @keyframes pulse-frame {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes popIn {
          0% {
            transform: scale(0.3);
            opacity: 0;
          }
          50% {
            transform: scale(1.1);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes shakeIcon {
          0%, 100% { transform: rotate(0deg) scale(1); }
          10% { transform: rotate(-5deg) scale(1.05); }
          20% { transform: rotate(5deg) scale(1.05); }
          30% { transform: rotate(-5deg); }
          40% { transform: rotate(5deg); }
          50% { transform: rotate(0deg); }
        }
        @keyframes searchPulse {
          0%, 100% {
            opacity: 0.3;
            box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.3);
          }
          50% {
            opacity: 1;
            box-shadow: 0 0 0 8px rgba(59, 130, 246, 0);
          }
        }
      `}</style>
    </div>
  );
}
