'use server';

import { and, eq, ilike, notInArray, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { db, schema } from '@/db';
import { writeAuditLog } from '@/lib/audit';
import { requireBatchStaffAccess } from '@/lib/batch/batch-access';
import { parseBatchForm } from '@/lib/batch/parse-batch-form';
import { requireRole } from '@/lib/auth/session';

// admin 和 staff 都能建立梯次；staff 建立的梯次會自動把自己加進承辦名單
// （負責人），否則建立完之後自己反而看不到、也管不了這個梯次。
export async function createBatch(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireRole(['admin', 'staff']);
  const parsed = parseBatchForm(formData);
  if ('error' in parsed) return parsed;

  const isStaff = session.user.role !== 'admin';

  const batchId = await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(schema.preorderBatch)
      .values(parsed)
      .returning({ id: schema.preorderBatch.id });

    if (isStaff) {
      await tx.insert(schema.preorderBatchStaff).values({
        batchId: batch.id,
        userId: session.user.id,
        role: 'owner',
        addedBy: session.user.id,
      });
    }

    return batch.id;
  });

  await writeAuditLog({
    actorId: session.user.id,
    action: 'preorder_batch.created',
    entityType: 'preorder_batch',
    entityId: batchId,
    after: parsed,
  });

  redirect(isStaff ? `/staff/batches/${batchId}` : `/admin/batches/${batchId}`);
}

export async function updateBatch(
  batchId: string,
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const session = await requireBatchStaffAccess(batchId);
  const parsed = parseBatchForm(formData);
  if ('error' in parsed) return parsed;

  const [before] = await db
    .select()
    .from(schema.preorderBatch)
    .where(eq(schema.preorderBatch.id, batchId))
    .limit(1);
  if (!before) return { error: '找不到此梯次' };

  await db
    .update(schema.preorderBatch)
    .set(parsed)
    .where(eq(schema.preorderBatch.id, batchId));

  await writeAuditLog({
    actorId: session.user.id,
    action: 'preorder_batch.updated',
    entityType: 'preorder_batch',
    entityId: batchId,
    before,
    after: parsed,
  });

  revalidatePath(`/admin/batches/${batchId}`);
  revalidatePath(`/admin/batches/${batchId}/edit`);
  revalidatePath('/admin/batches');
  revalidatePath(`/staff/batches/${batchId}`);
  revalidatePath(`/staff/batches/${batchId}/edit`);
  return { success: true };
}

export async function updateBatchStatus(
  batchId: string,
  status: 'draft' | 'open' | 'closed',
) {
  const session = await requireBatchStaffAccess(batchId);

  const [before] = await db
    .select({ status: schema.preorderBatch.status })
    .from(schema.preorderBatch)
    .where(eq(schema.preorderBatch.id, batchId))
    .limit(1);
  if (!before) return { error: '找不到此梯次' };

  await db
    .update(schema.preorderBatch)
    .set({ status })
    .where(eq(schema.preorderBatch.id, batchId));

  await writeAuditLog({
    actorId: session.user.id,
    action: 'preorder_batch.status_changed',
    entityType: 'preorder_batch',
    entityId: batchId,
    before: { status: before.status },
    after: { status },
  });

  revalidatePath(`/admin/batches/${batchId}`);
  revalidatePath('/admin/batches');
  revalidatePath(`/staff/batches/${batchId}`);
  revalidatePath('/staff');
  return {};
}

export async function addBookToBatch(
  batchId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireBatchStaffAccess(batchId);

  const bookId = String(formData.get('bookId') ?? '');
  const basePriceRaw = String(formData.get('basePrice') ?? '');
  const quantityLimitRaw = String(formData.get('quantityLimit') ?? '').trim();

  const basePrice = Number(basePriceRaw);
  if (!bookId) return { error: '請選擇書籍' };
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    return { error: '基本售價需為非負整數' };
  }
  let quantityLimit: number | null = null;
  if (quantityLimitRaw !== '') {
    quantityLimit = Number(quantityLimitRaw);
    if (!Number.isFinite(quantityLimit) || quantityLimit <= 0) {
      return { error: '預購數量上限需為正整數，留空代表不限量' };
    }
  }

  const [existing] = await db
    .select({ id: schema.preorderBatchBook.id })
    .from(schema.preorderBatchBook)
    .where(
      and(
        eq(schema.preorderBatchBook.batchId, batchId),
        eq(schema.preorderBatchBook.bookId, bookId),
      ),
    )
    .limit(1);
  if (existing) return { error: '此書已在此梯次開放預購' };

  const batchBookId = await db.transaction(async (tx) => {
    const [batchBook] = await tx
      .insert(schema.preorderBatchBook)
      .values({ batchId, bookId, quantityLimit })
      .returning({ id: schema.preorderBatchBook.id });

    await tx.insert(schema.preorderBatchBookPriceTier).values({
      batchBookId: batchBook.id,
      minQuantity: 1,
      price: Math.floor(basePrice),
    });

    return batchBook.id;
  });

  await writeAuditLog({
    actorId: session.user.id,
    action: 'preorder_batch_book.added',
    entityType: 'preorder_batch_book',
    entityId: batchBookId,
    after: { batchId, bookId, quantityLimit, basePrice },
  });

  revalidatePath(`/admin/batches/${batchId}`);
  revalidatePath(`/staff/batches/${batchId}`);
  return {};
}

export async function setBatchBookActive(
  batchBookId: string,
  batchId: string,
  isActive: boolean,
) {
  const session = await requireBatchStaffAccess(batchId);

  // requireBatchStaffAccess 只確認呼叫端對 batchId 這個梯次有權限，不代表
  // batchBookId 這個品項也屬於同一個梯次——staff 版權限開放後，惡意呼叫端
  // 理論上可以帶自己有權限的 batchId、卻塞別的梯次的 batchBookId 進來，
  // 把條件一起放進 where 子句，確保只有真的屬於這個梯次的品項才會被改到。
  await db
    .update(schema.preorderBatchBook)
    .set({ isActive })
    .where(
      and(
        eq(schema.preorderBatchBook.id, batchBookId),
        eq(schema.preorderBatchBook.batchId, batchId),
      ),
    );

  await writeAuditLog({
    actorId: session.user.id,
    action: 'preorder_batch_book.active_changed',
    entityType: 'preorder_batch_book',
    entityId: batchBookId,
    after: { isActive },
  });

  revalidatePath(`/admin/batches/${batchId}`);
  revalidatePath(`/staff/batches/${batchId}`);
  return {};
}

export async function addPriceTier(
  batchBookId: string,
  batchId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireBatchStaffAccess(batchId);

  const minQuantity = Number(formData.get('minQuantity'));
  const price = Number(formData.get('price'));
  if (!Number.isFinite(minQuantity) || minQuantity < 1) {
    return { error: '門檻數量需為 1 以上的整數' };
  }
  if (!Number.isFinite(price) || price < 0) {
    return { error: '價格需為非負整數' };
  }

  // 同上（見 setBatchBookActive 的說明）：確認 batchBookId 真的屬於呼叫端
  // 有權限的這個梯次，避免 staff 拿別的梯次的 batchBookId 混進來加價格級距。
  const [batchBook] = await db
    .select({ id: schema.preorderBatchBook.id })
    .from(schema.preorderBatchBook)
    .where(
      and(
        eq(schema.preorderBatchBook.id, batchBookId),
        eq(schema.preorderBatchBook.batchId, batchId),
      ),
    )
    .limit(1);
  if (!batchBook) return { error: '找不到此品項' };

  const [existing] = await db
    .select({ id: schema.preorderBatchBookPriceTier.id })
    .from(schema.preorderBatchBookPriceTier)
    .where(
      and(
        eq(schema.preorderBatchBookPriceTier.batchBookId, batchBookId),
        eq(
          schema.preorderBatchBookPriceTier.minQuantity,
          Math.floor(minQuantity),
        ),
      ),
    )
    .limit(1);
  if (existing)
    return { error: '此門檻數量已存在，請改用不同的數量或先刪除舊的' };

  await db.insert(schema.preorderBatchBookPriceTier).values({
    batchBookId,
    minQuantity: Math.floor(minQuantity),
    price: Math.floor(price),
  });

  await writeAuditLog({
    actorId: session.user.id,
    action: 'preorder_batch_book_price_tier.added',
    entityType: 'preorder_batch_book_price_tier',
    entityId: batchBookId,
    after: { minQuantity, price },
  });

  revalidatePath(`/admin/batches/${batchId}`);
  revalidatePath(`/staff/batches/${batchId}`);
  return {};
}

export async function deletePriceTier(tierId: string, batchId: string) {
  const session = await requireBatchStaffAccess(batchId);

  const [tier] = await db
    .select()
    .from(schema.preorderBatchBookPriceTier)
    .where(eq(schema.preorderBatchBookPriceTier.id, tierId))
    .limit(1);
  if (!tier) return { error: '找不到此級距' };

  // 同上：tierId 本身沒有帶 batchId 資訊，這裡另外查一次它所屬的
  // batchBookId 是不是真的屬於呼叫端有權限的這個梯次，避免 staff 拿別的
  // 梯次的 tierId 混進來刪掉別人的價格級距。
  const [batchBook] = await db
    .select({ id: schema.preorderBatchBook.id })
    .from(schema.preorderBatchBook)
    .where(
      and(
        eq(schema.preorderBatchBook.id, tier.batchBookId),
        eq(schema.preorderBatchBook.batchId, batchId),
      ),
    )
    .limit(1);
  if (!batchBook) return { error: '找不到此級距' };

  if (tier.minQuantity === 1) {
    return {
      error:
        '基本級距（滿 1 件）不可刪除，請改用「新增書籍」時設定的售價編輯方式',
    };
  }

  await db
    .delete(schema.preorderBatchBookPriceTier)
    .where(eq(schema.preorderBatchBookPriceTier.id, tierId));

  await writeAuditLog({
    actorId: session.user.id,
    action: 'preorder_batch_book_price_tier.deleted',
    entityType: 'preorder_batch_book_price_tier',
    entityId: tierId,
    before: tier,
  });

  revalidatePath(`/admin/batches/${batchId}`);
  revalidatePath(`/staff/batches/${batchId}`);
  return {};
}

export async function searchUsersForStaffAssignment(
  batchId: string,
  query: string,
) {
  await requireRole('admin');

  const keyword = query.trim();
  if (keyword.length < 1) return [];

  const existingStaffIds = await db
    .select({ userId: schema.preorderBatchStaff.userId })
    .from(schema.preorderBatchStaff)
    .where(eq(schema.preorderBatchStaff.batchId, batchId));
  const excludeIds = existingStaffIds.map((r) => r.userId);

  const pattern = `%${keyword}%`;
  const rows = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      role: schema.user.role,
    })
    .from(schema.user)
    .where(
      and(
        or(ilike(schema.user.name, pattern), ilike(schema.user.email, pattern)),
        excludeIds.length > 0
          ? notInArray(schema.user.id, excludeIds)
          : undefined,
      ),
    )
    .limit(8);

  return rows;
}

export async function addBatchStaff(
  batchId: string,
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const session = await requireRole('admin');

  const userId = String(formData.get('userId') ?? '').trim();
  const role = formData.get('role') === 'owner' ? 'owner' : 'assistant';
  if (!userId) return { error: '請先搜尋並選擇一位使用者' };

  const [user] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.id, userId))
    .limit(1);
  if (!user) return { error: '找不到此使用者，可能帳號已被刪除，請重新搜尋' };

  const [existing] = await db
    .select({ id: schema.preorderBatchStaff.id })
    .from(schema.preorderBatchStaff)
    .where(
      and(
        eq(schema.preorderBatchStaff.batchId, batchId),
        eq(schema.preorderBatchStaff.userId, user.id),
      ),
    )
    .limit(1);
  if (existing) return { error: '此帳號已是此梯次的承辦人員' };

  await db.insert(schema.preorderBatchStaff).values({
    batchId,
    userId: user.id,
    role,
    addedBy: session.user.id,
  });

  await writeAuditLog({
    actorId: session.user.id,
    action: 'preorder_batch_staff.added',
    entityType: 'preorder_batch_staff',
    entityId: batchId,
    after: { userId: user.id, role },
  });

  revalidatePath(`/admin/batches/${batchId}`);
  return { success: true };
}

export async function removeBatchStaff(staffRowId: string, batchId: string) {
  const session = await requireRole('admin');

  await db
    .delete(schema.preorderBatchStaff)
    .where(eq(schema.preorderBatchStaff.id, staffRowId));

  await writeAuditLog({
    actorId: session.user.id,
    action: 'preorder_batch_staff.removed',
    entityType: 'preorder_batch_staff',
    entityId: staffRowId,
  });

  revalidatePath(`/admin/batches/${batchId}`);
  return {};
}
