import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/db';

// 書籍封面圖片的實際檔案內容。公開、不驗證登入狀態 - 書封面不是敏感資訊，
// 這樣瀏覽器快取／CDN 才能正常運作，不用每次都帶 cookie。
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const { bookId } = await params;

  const [row] = await db
    .select()
    .from(schema.bookCoverImage)
    .where(eq(schema.bookCoverImage.bookId, bookId))
    .limit(1);

  if (!row) {
    return new NextResponse('Not Found', { status: 404 });
  }

  return new NextResponse(new Uint8Array(row.data), {
    headers: {
      'Content-Type': row.mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(row.size),
    },
  });
}
