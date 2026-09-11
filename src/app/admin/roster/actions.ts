'use server';

import { and, eq, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db, schema } from '@/db';
import { writeAuditLog } from '@/lib/audit';
import { isUniqueViolation } from '@/lib/db-errors';
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
  const realNameInput = String(formData.get('realName') ?? '').trim();

  // 學號有改動：通常是管理員發現學生當初綁定時學號打錯／輸入錯誤，要修正成
  // 名冊裡真正對應的那一筆。改完的學號如果剛好撞到「另一筆」既有名冊資料
  // （不分大小寫比對，跟 bind-roster 的 claimStudentId 用同一套比對邏輯），
  // 兩筆不能並存（studentId 有 unique constraint），得合併過去，不能直接照
  // 原本的路更新這筆，否則就是使用者遇到的那個 duplicate key 錯誤。
  if (studentId.toLowerCase() !== row.studentId.toLowerCase()) {
    const [conflictRow] = await db
      .select()
      .from(schema.studentRoster)
      .where(
        and(
          eq(
            sql`lower(${schema.studentRoster.studentId})`,
            studentId.toLowerCase(),
          ),
          ne(schema.studentRoster.id, rosterId),
        ),
      )
      .limit(1);

    if (conflictRow) {
      if (conflictRow.claimedByUserId) {
        return {
          error: '修正後的學號已經被其他帳號綁定，無法合併，請確認學號是否正確',
        };
      }

      // 合併：把這筆（學生實際綁定的這個帳號）的綁定資訊搬到「正確」的那筆
      // 名冊資料上並直接核實，原本打錯學號建的這筆就沒有存在意義了，直接
      // 刪除——完整內容留在 audit log 的 before 裡，不會憑空消失。姓名優先
      // 用表單這次填的，其次才是目標那筆本來的姓名（通常是校方匯入的權威
      // 資料，比學生自報的更可信，不用原本這筆打錯的姓名）。
      const realName = realNameInput || conflictRow.realName;

      await db.transaction(async (tx) => {
        // 順序很重要：claimedByUserId 也有 unique constraint，一定要先刪掉
        // 舊的這筆（釋出 claimedByUserId），再把它寫到目標那筆，不然這筆跟
        // 目標筆會同時存在同一個 claimedByUserId，一樣撞 unique constraint。
        await tx
          .delete(schema.studentRoster)
          .where(eq(schema.studentRoster.id, rosterId));

        await tx
          .update(schema.studentRoster)
          .set({
            realName,
            claimedByUserId: row.claimedByUserId,
            claimedAt: row.claimedAt,
            claimMethod: row.claimMethod,
            verifiedAt: new Date(),
            verifiedBy: session.user.id,
          })
          .where(eq(schema.studentRoster.id, conflictRow.id));
      });

      await writeAuditLog({
        actorId: session.user.id,
        action: 'student_roster.merged',
        entityType: 'student_roster',
        entityId: conflictRow.id,
        before: { wrongRow: row, correctRow: conflictRow },
        after: {
          studentId: conflictRow.studentId,
          realName,
          claimedByUserId: row.claimedByUserId,
          verifiedBy: session.user.id,
          mergedFromRosterId: rosterId,
        },
      });

      revalidatePath('/admin/roster');
      return {};
    }
  }

  const realName = realNameInput || row.realName;

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
    if (isUniqueViolation(err)) {
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
