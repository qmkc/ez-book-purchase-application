// 書籍表單解析：admin 和 staff 建立/編輯書籍的 server action 共用同一份解析
// 邏輯，見 src/app/admin/books/actions.ts。

export type BookInput = {
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

export function parseBookForm(
  formData: FormData,
): BookInput | { error: string } {
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
