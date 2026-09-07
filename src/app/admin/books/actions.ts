'use server';

import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';

import { db, schema } from '@/db';
import { writeAuditLog } from '@/lib/audit';
import {
  deleteCoverImageUpload,
  saveCoverImageUpload,
} from '@/lib/book/book-cover';
import { requireRole } from '@/lib/auth/session';

type BookInput = {
  title: string;
  isbn: string | null;
  author: string | null;
  publisher: string | null;
  coverImageUrl: string | null;
  description: string | null;
  listPrice: number;
  subject: string | null;
  gradeLevel: string | null;
};

function parseBookForm(formData: FormData): BookInput | { error: string } {
  const title = String(formData.get('title') ?? '').trim();
  const listPriceRaw = String(formData.get('listPrice') ?? '').trim();
  const listPrice = Number(listPriceRaw);

  if (!title) return { error: '請輸入書名' };
  if (!Number.isFinite(listPrice) || listPrice < 0) {
    return { error: '建議售價需為非負整數' };
  }

  const optional = (name: string) => {
    const value = String(formData.get(name) ?? '').trim();
    return value === '' ? null : value;
  };

  return {
    title,
    listPrice: Math.floor(listPrice),
    isbn: optional('isbn'),
    author: optional('author'),
    publisher: optional('publisher'),
    coverImageUrl: optional('coverImageUrl'),
    description: optional('description'),
    subject: optional('subject'),
    gradeLevel: optional('gradeLevel'),
  };
}

function isOwnUploadUrl(bookId: string, url: string | null) {
  return url?.startsWith(`/api/books/${bookId}/cover`) ?? false;
}

async function resolveCoverImage(
  bookId: string,
  formData: FormData,
  parsedCoverImageUrl: string | null,
  previousCoverImageUrl: string | null,
): Promise<{ error: string } | { coverImageUrl: string | null }> {
  const removeCoverImage = formData.get('removeCoverImage') === 'on';
  if (removeCoverImage) {
    if (isOwnUploadUrl(bookId, previousCoverImageUrl)) {
      await deleteCoverImageUpload(bookId);
    }
    return { coverImageUrl: null };
  }

  const file = formData.get('coverImageFile');
  if (file instanceof File && file.size > 0) {
    const result = await saveCoverImageUpload(bookId, file);
    if (!result.ok) return { error: result.error };
    return { coverImageUrl: result.coverImageUrl };
  }

  // 沒有上傳新檔案：如果舊的是我們自己存的上傳檔案、但這次填的網址已經變成
  // 別的東西（或被清空），代表使用者改用外部網址了，舊檔案就沒有用了。
  if (
    isOwnUploadUrl(bookId, previousCoverImageUrl) &&
    previousCoverImageUrl !== parsedCoverImageUrl
  ) {
    await deleteCoverImageUpload(bookId);
  }
  return { coverImageUrl: parsedCoverImageUrl };
}

export async function createBook(
  _prevState: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireRole('admin');
  const parsed = parseBookForm(formData);
  if ('error' in parsed) return parsed;

  // 新書還沒有 id 可以先存圖片，所以先插入一筆，再視情況補上封面圖片。
  const [book] = await db
    .insert(schema.book)
    .values({ ...parsed, coverImageUrl: null })
    .returning({ id: schema.book.id });

  const coverResult = await resolveCoverImage(
    book.id,
    formData,
    parsed.coverImageUrl,
    null,
  );
  if ('error' in coverResult) return coverResult;

  if (coverResult.coverImageUrl) {
    await db
      .update(schema.book)
      .set({ coverImageUrl: coverResult.coverImageUrl })
      .where(eq(schema.book.id, book.id));
  }

  await writeAuditLog({
    actorId: session.user.id,
    action: 'book.created',
    entityType: 'book',
    entityId: book.id,
    after: { ...parsed, coverImageUrl: coverResult.coverImageUrl },
  });

  redirect(`/admin/books/${book.id}`);
}

export async function updateBook(
  bookId: string,
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const session = await requireRole('admin');
  const parsed = parseBookForm(formData);
  if ('error' in parsed) return parsed;

  const [before] = await db
    .select()
    .from(schema.book)
    .where(eq(schema.book.id, bookId))
    .limit(1);
  if (!before) return { error: '找不到此書籍' };

  const coverResult = await resolveCoverImage(
    bookId,
    formData,
    parsed.coverImageUrl,
    before.coverImageUrl,
  );
  if ('error' in coverResult) return coverResult;

  const updated = { ...parsed, coverImageUrl: coverResult.coverImageUrl };
  await db.update(schema.book).set(updated).where(eq(schema.book.id, bookId));

  await writeAuditLog({
    actorId: session.user.id,
    action: 'book.updated',
    entityType: 'book',
    entityId: bookId,
    before,
    after: updated,
  });

  return { success: true };
}
