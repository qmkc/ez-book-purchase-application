import { Button, Text } from '@react-email/components';

import { EmailLayout } from './components/layout';

export type RosterPendingStudentEmailProps = {
  studentId: string;
  realName: string;
  // 沒設定 BETTER_AUTH_URL 時就不附連結，見 src/lib/email.tsx 的 appUrl()。
  bindRosterUrl?: string;
};

export default function RosterPendingStudentEmail({
  studentId,
  realName,
  bindRosterUrl,
}: RosterPendingStudentEmailProps) {
  return (
    <EmailLayout preview="您的學號綁定資料尚待核實">
      <Text className="m-0 mb-4 text-base text-zinc-700">
        您好，您先前填寫的學號（{studentId}）與姓名（{realName}）綁定資料，目前尚未經管理員核實。
      </Text>
      <Text className="m-0 mb-4 text-sm text-zinc-500">
        這不影響您現在下單，但建議確認學號與姓名是否填寫正確；如有疑問請聯繫教務處。
      </Text>
      {bindRosterUrl && (
        <Button
          href={bindRosterUrl}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white"
        >
          前往確認綁定資料
        </Button>
      )}
    </EmailLayout>
  );
}

RosterPendingStudentEmail.PreviewProps = {
  studentId: 'S1234567',
  realName: '王小明',
  bindRosterUrl: 'https://example.com/bind-roster',
} satisfies RosterPendingStudentEmailProps;
