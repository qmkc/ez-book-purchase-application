import { Section, Text } from '@react-email/components';

import { EmailLayout } from './components/layout';

export type OtpEmailProps = {
  heading: string;
  otp: string;
};

// 所有驗證碼信共用一份樣板（登入/Email 驗證/重設密碼/變更 Email/學校信箱
// 綁定），差異只有標題文案，見 src/lib/email.tsx 的 OTP_EMAIL_COPY。
export default function OtpEmail({ heading, otp }: OtpEmailProps) {
  return (
    <EmailLayout preview={`${heading}：${otp}`}>
      <Text className="m-0 mb-4 text-base text-zinc-700">{heading}：</Text>
      <Section className="mb-4 rounded-lg bg-zinc-100 py-4 text-center">
        <Text className="m-0 text-3xl font-bold tracking-[0.3em] text-zinc-900">
          {otp}
        </Text>
      </Section>
      <Text className="m-0 text-sm text-zinc-500">
        驗證碼 5 分鐘內有效，請勿提供給他人。若不是您本人操作，請忽略此信。
      </Text>
    </EmailLayout>
  );
}

// react-email CLI（pnpm email:dev）預覽用的示範資料，不影響實際寄信邏輯。
OtpEmail.PreviewProps = {
  heading: '您的登入驗證碼',
  otp: '123456',
} satisfies OtpEmailProps;
