import 'server-only';

import { Resend } from 'resend';

import OtpEmail from '@/emails/otp-email';
import RosterPendingAdminEmail from '@/emails/roster-pending-admin-email';
import RosterPendingStudentEmail from '@/emails/roster-pending-student-email';

// Resend free plan 每天/每月寄信量有硬性上限（目前是 100 封/天、3000 封/月），
// 這裡只負責「怎麼寄」，不負責「額度夠不夠寄」——額度控管交給
// emailOTP plugin 內建的 rateLimit（見 src/lib/auth.ts），擋同一個
// email 短時間內重複要求驗證碼。如果同時上線的使用者一多，日額度還是可能被
// 用完，那要嘛升級 Resend 方案，要嘛之後在這裡加一個「今天已寄幾封」的計數
// 器擋新請求，先不做，等真的遇到再說。
//
// 故意 lazy 建立：`new Resend(undefined)` 在 SDK 建構子就會直接丟例外，如果
// module-level 就 new 出來，任何沒設 RESEND_API_KEY 的環境（例如
// `pnpm auth:gen` 這種只是要讀 schema、不會真的寄信的 CLI）都會直接掛掉。
let resendClient: Resend | undefined;
function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY 未設定，無法寄送驗證碼信');
  }
  resendClient ??= new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

// 已驗證的寄件網域信箱，例如 no-reply@your-domain.com。開發階段沒設定就
// fallback 成 Resend 的測試寄件位址，但那個位址只能寄給你自己 Resend 帳號
// 的信箱，正式環境一定要設 RESEND_FROM_EMAIL。
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';

// 信件裡「前往確認資料」之類的連結要組完整網址，借用 better-auth 本來就在
// 用的站台網址（見 src/lib/auth/auth.ts 的 baseURL）。開發環境常常沒特別設
// 這個之外的網址，沒設定就乾脆不附連結，不影響信件本身寄送。
const APP_URL = process.env.BETTER_AUTH_URL;

function appUrl(path: string) {
  return APP_URL ? new URL(path, APP_URL).toString() : undefined;
}

type OTPEmailType =
  | 'sign-in'
  | 'email-verification'
  | 'forget-password'
  | 'change-email'
  // 學號綁定用的學校信箱驗證，跟 better-auth 帳號本身的 email 驗證是分開的
  // 一組（見 src/lib/roster/school-email-otp.ts）——帳號登入 email（例如學生
  // 自己的 Google 帳號）不需要跟學校信箱一樣，這裡只是額外證明「這個人拿得
  // 到這個學校信箱」，不會去改動帳號的登入 email。
  | 'school-email-verification';

const OTP_EMAIL_COPY: Record<
  OTPEmailType,
  { subject: string; heading: string }
> = {
  'sign-in': { subject: '登入驗證碼', heading: '您的登入驗證碼' },
  'email-verification': {
    subject: 'Email 驗證碼',
    heading: '您的 Email 驗證碼',
  },
  'forget-password': {
    subject: '重設密碼驗證碼',
    heading: '您的重設密碼驗證碼',
  },
  'change-email': {
    subject: '變更 Email 驗證碼',
    heading: '您的變更 Email 驗證碼',
  },
  'school-email-verification': {
    subject: '學校信箱驗證碼',
    heading: '您的學校信箱驗證碼（用於綁定學號）',
  },
};

export async function sendOTPEmail({
  email,
  otp,
  type,
}: {
  email: string;
  otp: string;
  type: OTPEmailType;
}) {
  const { subject, heading } = OTP_EMAIL_COPY[type];

  const { error } = await getResendClient().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject,
    react: <OtpEmail heading={heading} otp={otp} />,
  });

  if (error) {
    // 讓錯誤往上丟給 better-auth，對應的 API 會回傳失敗，而不是假裝寄信成功。
    throw new Error(`Resend 寄信失敗（type: ${type}）：${error.message}`);
  }
}

// 學號綁定資料逾期未核實，提醒學生本人的信——見
// src/lib/roster/roster-notifications.ts 的 checkAndNotifyStaleClaims。
export async function sendRosterPendingReminderEmail({
  to,
  studentId,
  realName,
}: {
  to: string;
  studentId: string;
  realName: string;
}) {
  const { error } = await getResendClient().emails.send({
    from: FROM_EMAIL,
    to,
    subject: '學號綁定資料尚待核實',
    react: (
      <RosterPendingStudentEmail
        studentId={studentId}
        realName={realName}
        bindRosterUrl={appUrl('/bind-roster')}
      />
    ),
  });

  if (error) {
    throw new Error(`Resend 寄信失敗（學號綁定提醒信）：${error.message}`);
  }
}

// 同一批逾期資料，另外寄給全體管理員的通知信。
export async function sendRosterPendingAdminAlertEmail({
  to,
  studentId,
  realName,
  claimedByEmail,
  thresholdDays,
}: {
  to: string;
  studentId: string;
  realName: string;
  claimedByEmail: string;
  thresholdDays: number;
}) {
  const { error } = await getResendClient().emails.send({
    from: FROM_EMAIL,
    to,
    subject: '有學號綁定資料等待核實',
    react: (
      <RosterPendingAdminEmail
        studentId={studentId}
        realName={realName}
        claimedByEmail={claimedByEmail}
        thresholdDays={thresholdDays}
        adminRosterUrl={appUrl('/admin/roster')}
      />
    ),
  });

  if (error) {
    throw new Error(`Resend 寄信失敗（管理員核實提醒信）：${error.message}`);
  }
}
