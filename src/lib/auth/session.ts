import 'server-only';

import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { db, schema } from '@/db';
import { auth } from '@/lib/auth/auth';

export type Role = 'admin' | 'staff' | 'student';

// 包一層 auth.api.getSession，統一補上 request headers；頁面/server action
// 需要當前登入者時都應該走這裡，不要各自重新拼 headers()。
export async function getCurrentSession() {
  return auth.api.getSession({ headers: await headers() });
}

// 只需要「有沒有登入」時使用；沒登入就導去 /login，並帶上 next 參數
// 讓登入後可以導回原本要去的頁面。
export async function requireSession(nextPath?: string) {
  const session = await getCurrentSession();
  if (!session) {
    const target = nextPath
      ? `/login?next=${encodeURIComponent(nextPath)}`
      : '/login';
    redirect(target);
  }
  return session;
}

// 需要特定角色（或角色其中之一）才能進入的頁面用這個。admin 視為超級使用者，
// 永遠放行；其餘角色需求完全符合才放行，否則導去首頁。
export async function requireRole(roles: Role | Role[], nextPath?: string) {
  const session = await requireSession(nextPath);
  const allowed = Array.isArray(roles) ? roles : [roles];
  const role = session.user.role as Role;
  if (role !== 'admin' && !allowed.includes(role)) {
    redirect('/');
  }
  return session;
}

// 學號綁定不是下單的前提條件——只是拿來提醒使用者「還沒填」，不擋任何頁面。
// 未綁定/尚未核實都不影響購買，核實與否由管理員之後在 /admin/roster 慢慢處理。
export async function isRosterBound(userId: string) {
  const [claimed] = await db
    .select({ id: schema.studentRoster.id })
    .from(schema.studentRoster)
    .where(eq(schema.studentRoster.claimedByUserId, userId))
    .limit(1);
  return Boolean(claimed);
}
