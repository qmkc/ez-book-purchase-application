import 'server-only';

import { eq } from 'drizzle-orm';

import { db, schema } from '@/db';
import { ALLOWED_COVER_IMAGE_TYPES, MAX_COVER_IMAGE_BYTES } from '@/lib/book/book-cover-constants';

const ALLOWED_MIME_TYPES = new Set(ALLOWED_COVER_IMAGE_TYPES);

// 上傳封面圖片：驗證格式/大小、把檔案內容存進 book_cover_image，並回傳讓
// 呼叫端拿去更新 book.coverImageUrl 的網址（帶 v= 版本參數避免瀏覽器吃到
// 舊的快取圖片）。
export async function saveCoverImageUpload(
  bookId: string,
  file: File,
): Promise<{ ok: false; error: string } | { ok: true; coverImageUrl: string }> {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { ok: false, error: '封面圖片僅支援 JPEG、PNG、WebP、GIF 格式' };
  }
  if (file.size > MAX_COVER_IMAGE_BYTES) {
    return { ok: false, error: `封面圖片檔案過大，上限 ${MAX_COVER_IMAGE_BYTES / 1024 / 1024}MB` };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  await db
    .insert(schema.bookCoverImage)
    .values({ bookId, mimeType: file.type, data: buffer, size: buffer.byteLength })
    .onConflictDoUpdate({
      target: schema.bookCoverImage.bookId,
      set: { mimeType: file.type, data: buffer, size: buffer.byteLength, updatedAt: new Date() },
    });

  return { ok: true, coverImageUrl: `/api/books/${bookId}/cover?v=${Date.now()}` };
}

// 清掉某本書已上傳的封面圖片檔案（改填外部網址、或使用者主動移除時用）。
// 不影響 book.coverImageUrl 本身，呼叫端自己決定要不要一併清空/改值。
export async function deleteCoverImageUpload(bookId: string) {
  await db.delete(schema.bookCoverImage).where(eq(schema.bookCoverImage.bookId, bookId));
}
