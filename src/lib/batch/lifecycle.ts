// 梯次是否仍開放給學生下單/取消/改數量：除了 status 要是 open，只要有設定
// 截止時間（endAt），目前時間一旦超過就一併視為關閉——避免承辦人員忘記手動
// 把梯次切成 closed 時，過了截止日期學生仍然能悄悄下單/取消/改數量。
// status 仍是最終依據：承辦人員也可以提早手動關閉（endAt 還沒到）或延後
// （見編輯梯次表單），這裡只是補上「到期即擋」這一層，不取代 status。
export function isBatchOrderable(
  batch: { status: string; endAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (batch.status !== 'open') return false;
  if (batch.endAt && now > batch.endAt) return false;
  return true;
}
