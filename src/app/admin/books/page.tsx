import Link from 'next/link';
import { desc } from 'drizzle-orm';

import { BookCoverThumbnail } from '@/components/book-cover-thumbnail';
import { db, schema } from '@/db';
import { formatTWD } from '@/lib/format';

export default async function AdminBooksPage() {
  const books = await db
    .select()
    .from(schema.book)
    .orderBy(desc(schema.book.createdAt));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">書籍</h1>
        <Link
          href="/admin/books/new"
          className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          新增書籍
        </Link>
      </div>
      <ul className="flex flex-col gap-2">
        {books.map((book) => (
          <li key={book.id}>
            <Link
              href={`/admin/books/${book.id}`}
              className="flex items-center justify-between gap-4 rounded-xl border border-black/10 p-4 transition-colors hover:bg-black/3 dark:border-white/15 dark:hover:bg-white/5"
            >
              <div className="flex items-center gap-3">
                <BookCoverThumbnail
                  coverImageUrl={book.coverImageUrl}
                  title={book.title}
                />
                <div>
                  <p className="font-medium">{book.title}</p>
                  <p className="text-xs text-zinc-500">
                    {[book.subject, book.gradeLevel]
                      .filter(Boolean)
                      .join(' · ') || '未分類'}
                  </p>
                </div>
              </div>
              <p className="text-sm">{formatTWD(book.listPrice)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
