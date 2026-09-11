import 'server-only';

import { Resend } from 'resend';

import OtpEmail from '@/emails/otp-email';

// Resend free plan 每天/每月寄信量有硬性上限（目前是 100 封/天、3000 封/月），
// 這裡只負責「怎麼寄」，不負責「額度夠不夠寄」——額度控管交給
// sendSchoolEmailOtp 那邊自己擋同一個 email 短時間內重複要求驗證碼（見
// src/lib/roster/school-email-otp.ts 的 MAX_ATTEMPTS/TTL）。如果同時上線的
// 使用者一多，日額度還是可能被用完，那要嘛升級 Resend 方案，要嘛之後在這裡
// 加一個「今天已寄幾封」的計數器擋新請求，先不做，等真的遇到再說。
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

// 登入改成只走 OAuth2（見 src/lib/auth/auth.ts），沒有 email/password 帳號
// 就沒有「登入信箱驗證碼」「忘記密碼」「變更信箱」這些流程了。這裡現在只
// 剩學號綁定用的學校信箱驗證——跟帳號本身的登入 email 是分開的一組（見
// src/lib/roster/school-email-otp.ts）：帳號登入 email（學生自己的 Google
// 帳號）不需要跟學校信箱一樣，這裡只是額外證明「這個人拿得到這個學校信
// 箱」，不會去改動帳號的登入 email。
export async function sendSchoolEmailVerificationOtp({
  email,
  otp,
}: {
  email: string;
  otp: string;
}) {
  const { error } = await getResendClient().emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: '學校信箱驗證碼',
    react: <OtpEmail heading="您的學校信箱驗證碼（用於綁定學號）" otp={otp} />,
  });

  if (error) {
    throw new Error(`Resend 寄信失敗（學校信箱驗證碼）：${error.message}`);
  }
}
