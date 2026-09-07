import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { db, schema } from '@/db';

import { updateBook } from '../actions';
import { BookForm } from '../book-form';

export default async function EditBookPage({
  params,
}: PageProps<'/admin/books/[bookId]'>) {
  const { bookId } = await params;

  const [book] = await db
    .select()
    .from(schema.book)
    .where(eq(schema.book.id, bookId))
    .limit(1);
  if (!book) notFound();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">編輯書籍</h1>
      <BookForm
        action={updateBook.bind(null, bookId)}
        defaults={book}
        submitLabel="儲存變更"
      />
    </div>
  );
}
