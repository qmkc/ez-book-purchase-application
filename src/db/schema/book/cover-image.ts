import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  integer,
  timestamp,
  customType,
} from 'drizzle-orm/pg-core';

import { book } from './book';

// drizzle-orm/pg-core 沒有內建的 bytea 型別，用 customType 自己宣告一個。
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

// 上傳的封面圖片實際檔案內容，跟 book 分開一張表，避免每次 SELECT * FROM book
// （書籍列表、梯次書籍清單等常見查詢）都得跟著撈一份圖片二進位資料。
// book.coverImageUrl 才是實際顯示圖片時 <img src> 用的欄位——上傳圖片時會把
// coverImageUrl 導向 /api/books/[bookId]/cover 這個 route handler；如果書籍
// 改填外部圖片網址，這張表對應的那筆資料就不再被參照，應該一併清掉。
export const bookCoverImage = pgTable('book_cover_image', {
  bookId: text('book_id')
    .primaryKey()
    .references(() => book.id, { onDelete: 'cascade' }),
  mimeType: text('mime_type').notNull(),
  data: bytea('data').notNull(),
  size: integer('size').notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const bookCoverImageRelations = relations(bookCoverImage, ({ one }) => ({
  book: one(book, {
    fields: [bookCoverImage.bookId],
    references: [book.id],
  }),
}));
