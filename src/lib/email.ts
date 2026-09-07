import { Resend } from 'resend';

// email 內文是用字串模板拼 HTML，凡是內插「使用者可自行輸入」的內容（例如學
// 生自報的學號/姓名）都要先跳脫，避免對方在信件內容裡塞連結/破壞排版的標籤
// ——多數信箱不會執行 <script>，但沒跳脫的話已經構成可以偽造連結的 HTML
// injection，尤其這類信會寄給管理員。系統自己產生的內容（OTP 數字等）不需要。
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

type OTPEmailType =
  | 'sign-in'
  | 'email-verification'
  | 'forget-password'
  | 'change-email'
  // 學號綁定用的學校信箱驗證，跟 better-auth 帳號本身的 email 驗證是分開的
  // 一組（見 src/lib/school-email-otp.ts）——帳號登入 email（例如學生自己的
  // Google 帳號）不需要跟學校信箱一樣，這裡只是額外證明「這個人拿得到這個
  // 學校信箱」，不會去改動帳號的登入 email。
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
    html: `
      <div style="font-family: sans-serif; font-size: 16px; color: #111827;">
        <p>${heading}：</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 16px 0;">${otp}</p>
        <p style="color: #6b7280; font-size: 14px;">驗證碼 5 分鐘內有效，請勿提供給他人。若不是您本人操作，請忽略此信。</p>
      </div>
    `,
  });

  if (error) {
    // 讓錯誤往上丟給 better-auth，對應的 API 會回傳失敗，而不是假裝寄信成功。
    throw new Error(`Resend 寄信失敗（type: ${type}）：${error.message}`);
  }
}

// 一般通知信（非驗證碼），例如「學號綁定資料還在等管理員核實」的提醒信，
// 給呼叫端自己組標題跟內文。
export async function sendNotificationEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const { error } = await getResendClient().emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html,
  });

  if (error) {
    throw new Error(`Resend 寄信失敗（subject: ${subject}）：${error.message}`);
  }
}
