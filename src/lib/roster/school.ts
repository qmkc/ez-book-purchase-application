// 學校信箱網域：{student_id}@這個網域 視為校方核發的信箱，可用來做最高信任層級
// 的學號綁定（見 src/db/schema/student/roster.ts 的 claimMethod 說明）。
// 可用環境變數覆寫，避免網域寫死在程式碼裡。
export const SCHOOL_EMAIL_DOMAIN = process.env.SCHOOL_EMAIL_DOMAIN ?? 'nfu.edu.tw';

// 從信箱解析出學號：必須完全符合「{student_id}@網域」格式，網域比對不分大小寫，
// 但保留學號原始大小寫（比對名冊時再另外做不分大小寫比對，見 bind-roster/actions.ts）。
export function parseStudentIdFromSchoolEmail(email: string): string | null {
  const domain = SCHOOL_EMAIL_DOMAIN.toLowerCase();
  const match = email.match(/^([^@\s]+)@([^@\s]+)$/);
  if (!match) return null;
  const [, localPart, emailDomain] = match;
  if (emailDomain.toLowerCase() !== domain) return null;
  return localPart;
}
