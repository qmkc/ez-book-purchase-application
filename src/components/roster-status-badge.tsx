import type { RosterVerificationStatus } from '@/lib/roster/roster-lookup';

const STATUS_LABEL: Record<RosterVerificationStatus, string> = {
  verified: '已核實',
  unverified: '未核實',
  unbound: '未綁定學號',
};

const STATUS_CLASS: Record<RosterVerificationStatus, string> = {
  verified:
    'bg-green-600/10 text-green-700 dark:text-green-400',
  unverified:
    'bg-amber-600/10 text-amber-700 dark:text-amber-400',
  unbound: 'bg-black/5 text-zinc-500 dark:bg-white/10 dark:text-zinc-400',
};

// 承辦人員/管理員看的學生名單共用同一顆徽章：有學號就顯示學號 + 核實狀態，
// 沒綁定就只顯示「未綁定學號」。跟 /admin/roster 頁面用的文字（已核實/
// 尚未核實/尚未綁定）意思一致，用詞稍微簡短一點方便塞進表格欄位。
export function RosterStatusBadge({
  studentId,
  verificationStatus,
  className = '',
}: {
  studentId: string | null;
  verificationStatus: RosterVerificationStatus;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${STATUS_CLASS[verificationStatus]} ${className}`}
    >
      {studentId && verificationStatus !== 'unbound' ? (
        <span className="font-mono">{studentId}</span>
      ) : null}
      {STATUS_LABEL[verificationStatus]}
    </span>
  );
}
