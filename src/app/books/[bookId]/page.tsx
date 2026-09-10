import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { db, schema } from '@/db';
import { formatTWD } from '@/lib/format';
// import { requireSession } from '@/lib/auth/session';

export default async function BookDetailPage({
  params,
}: PageProps<'/books/[bookId]'>) {
  const { bookId } = await params;
  // await requireSession(`/books/${bookId}`);

  const [book] = await db
    .select()
    .from(schema.book)
    .where(eq(schema.book.id, bookId))
    .limit(1);
  if (!book) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <div className="flex flex-col gap-6 sm:flex-row">
        {book.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- 來源可能是我們自己的 route handler 或任意外部網址，不透過 next/image 最佳化
          <img
            src={book.coverImageUrl}
            alt={`《${book.title}》封面`}
            className="h-64 w-48 shrink-0 self-start rounded-lg border border-black/10 object-cover dark:border-white/15"
          />
        ) : (
          <div
            className="h-64 w-48 shrink-0 self-start rounded-lg border border-black/10 bg-black/3 dark:border-white/15 dark:bg-white/5"
            aria-hidden="true"
          />
        )}

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {book.title}
          </h1>
          <p className="mt-2 text-lg font-medium">
            {formatTWD(book.listPrice)}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            建議售價，實際成交價依所屬預購梯次的團購級距而定
          </p>

          <dl className="mt-4 flex flex-col gap-1 text-sm">
            {book.author && (
              <div className="flex gap-2">
                <dt className="text-zinc-500">作者</dt>
                <dd>{book.author}</dd>
              </div>
            )}
            {book.publisher && (
              <div className="flex gap-2">
                <dt className="text-zinc-500">出版社</dt>
                <dd>{book.publisher}</dd>
              </div>
            )}
            {book.isbn && (
              <div className="flex gap-2">
                <dt className="text-zinc-500">ISBN</dt>
                <dd>{book.isbn}</dd>
              </div>
            )}
            {(book.subject || book.gradeLevel) && (
              <div className="flex gap-2">
                <dt className="text-zinc-500">適用</dt>
                <dd>
                  {[book.subject, book.gradeLevel].filter(Boolean).join(' · ')}
                </dd>
              </div>
            )}
          </dl>

          {book.description && (
            <p className="mt-4 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
              {book.description}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
