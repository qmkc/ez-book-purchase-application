import { BookForm } from '@/components/book-form';

import { createBook } from '@/app/admin/books/actions';

export default async function StaffNewBookPage({
  searchParams,
}: PageProps<'/staff/books/new'>) {
  const { batchId } = await searchParams;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">新增書籍</h1>
      <BookForm
        action={createBook}
        submitLabel="建立書籍"
        hiddenFields={
          typeof batchId === 'string'
            ? { returnTo: `/staff/batches/${batchId}` }
            : undefined
        }
      />
    </div>
  );
}
