import { createBook } from '../actions';
import { BookForm } from '../book-form';

export default function NewBookPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">新增書籍</h1>
      <BookForm action={createBook} submitLabel="建立書籍" />
    </div>
  );
}
