// 掃描成功時的輕量回饋（震動 + 一聲提示音），純瀏覽器端行為，跟哪個掃描
// 頁面無關——單一梯次的 ScanWidget 跟聯合模式的 ScanWidget 都會用到，抽出來
// 避免兩份各自維護一份幾乎一樣的 AudioContext 邏輯。
export async function playScanFeedback() {
  try {
    navigator.vibrate?.(60);
  } catch {}

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.12);
    oscillator.onended = () => ctx.close();
  } catch {}
}
