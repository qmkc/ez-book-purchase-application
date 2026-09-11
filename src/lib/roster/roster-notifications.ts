// 綁定超過這麼多天還沒被管理員核實，/admin/roster 就會把該筆標成「逾期未
// 核實」（見該頁的 isOverdue/status=overdue 篩選），純粹是畫面上的提醒，
// 不會另外寄信——逾期與否完全不影響學生下單。
export const REMINDER_THRESHOLD_DAYS = Number(
  process.env.ROSTER_VERIFICATION_REMINDER_DAYS ?? '3',
);
