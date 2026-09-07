import { Button, Text } from '@react-email/components';

import { EmailLayout } from './components/layout';

export type RosterPendingAdminEmailProps = {
  studentId: string;
  realName: string;
  claimedByEmail: string;
  thresholdDays: number;
  // 沒設定 BETTER_AUTH_URL 時就不附連結，見 src/lib/email.tsx 的 appUrl()。
  adminRosterUrl?: string;
};

export default function RosterPendingAdminEmail({
  studentId,
  realName,
  claimedByEmail,
  thresholdDays,
  adminRosterUrl,
}: RosterPendingAdminEmailProps) {
  return (
    <EmailLayout preview={`學號 ${studentId} 的綁定資料等待核實`}>
      <Text className="m-0 mb-4 text-base text-zinc-700">
        學號 {studentId}（{realName}，{claimedByEmail}）的綁定資料已超過{' '}
        {thresholdDays} 天尚未核實，請至後台 /admin/roster 確認。
      </Text>
      {adminRosterUrl && (
        <Button
          href={adminRosterUrl}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white"
        >
          前往後台核實
        </Button>
      )}
    </EmailLayout>
  );
}

RosterPendingAdminEmail.PreviewProps = {
  studentId: 'S1234567',
  realName: '王小明',
  claimedByEmail: 'student@example.com',
  thresholdDays: 3,
  adminRosterUrl: 'https://example.com/admin/roster',
} satisfies RosterPendingAdminEmailProps;
