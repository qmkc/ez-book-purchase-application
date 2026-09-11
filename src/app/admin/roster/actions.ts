'use server';

import { eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db, schema } from '@/db';
import { writeAuditLog } from '@/lib/audit';
import { requireRole } from '@/lib/auth/session';

export async function importRoster(
  _prevState: { error?: string; imported?: number } | undefined,
  formData: FormData,
): Promise<{ error?: string; imported?: number }> {
  const session = await requireRole('admin');

  const raw = String(formData.get('rows') ?? '');
  const rows = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [studentId, ...rest] = line.split(/[,\t]/);
      return { studentId: studentId?.trim(), realName: rest.join(',').trim() };
    });

  const invalid = rows.filter((r) => !r.studentId || !r.realName);
  if (rows.length === 0) {
    return { error: '請輸入至少一筆資料' };
  }
  if (invalid.length > 0) {
    return {
      error: `有 ${invalid.length} 行格式不正確，請確認每行都是「學號,姓名」`,
    };
  }

  await db
    .insert(schema.studentRoster)
    .values(
      rows.map((r) => ({
        studentId: r.studentId!,
        realName: r.realName,
        importedBy: session.user.id,
      })),
    )
    .onConflictDoUpdate({
      target: schema.studentRoster.studentId,
      set: {
        realName: sql`excluded.real_name`,
        importedBy: session.user.id,
        updatedAt: new Date(),
        verifiedAt: sql`case
          when student_roster.claimed_at is not null
           and student_roster.verified_at is null
           and student_roster.real_name = excluded.real_name
          then now()
          else student_roster.verified_at
        end`,
      },
    });

  await writeAuditLog({
    actorId: session.user.id,
    action: 'student_roster.imported',
    entityType: 'student_roster',
    entityId: 'bulk',
    metadata: { count: rows.length },
  });

  revalidatePath('/admin/roster');
  return { imported: rows.length };
}

export async function verifyRosterClaim(
  rosterId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireRole('admin');

  const [row] = await db
    .select()
    .from(schema.studentRoster)
    .where(eq(schema.studentRoster.id, rosterId))
    .limit(1);
  if (!row) return { error: '找不到此筆名冊資料' };
  if (!row.claimedAt) return { error: '此筆資料尚未被任何帳號綁定，無法核實' };

  const studentId =
    String(formData.get('studentId') ?? '').trim() || row.studentId;
  const realName =
    String(formData.get('realName') ?? '').trim() || row.realName;

  try {
    await db
      .update(schema.studentRoster)
      .set({
        studentId,
        realName,
        verifiedAt: new Date(),
        verifiedBy: session.user.id,
      })
      .where(eq(schema.studentRoster.id, rosterId));
  } catch (err) {
    if ((err as { code?: string })?.code === '23505') {
      return { error: '這個學號已經被其他名冊資料使用，請確認後再修正' };
    }
    throw err;
  }

  await writeAuditLog({
    actorId: session.user.id,
    action: 'student_roster.verified',
    entityType: 'student_roster',
    entityId: rosterId,
    before: { studentId: row.studentId, realName: row.realName },
    after: { studentId, realName, verifiedBy: session.user.id },
  });

  revalidatePath('/admin/roster');
  return {};
}

export async function unverifyRosterClaim(
  rosterId: string,
): Promise<{ error?: string }> {
  const session = await requireRole('admin');

  const [row] = await db
    .select()
    .from(schema.studentRoster)
    .where(eq(schema.studentRoster.id, rosterId))
    .limit(1);
  if (!row) return { error: '找不到此筆名冊資料' };
  if (!row.verifiedAt) return {};

  await db
    .update(schema.studentRoster)
    .set({ verifiedAt: null, verifiedBy: null })
    .where(eq(schema.studentRoster.id, rosterId));

  await writeAuditLog({
    actorId: session.user.id,
    action: 'student_roster.unverified',
    entityType: 'student_roster',
    entityId: rosterId,
    before: { verifiedAt: row.verifiedAt, verifiedBy: row.verifiedBy },
    after: { verifiedAt: null, verifiedBy: null },
  });

  revalidatePath('/admin/roster');
  return {};
}
