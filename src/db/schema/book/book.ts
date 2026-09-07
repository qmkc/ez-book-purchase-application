import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  integer,
  timestamp,
  index,
  check,
} from 'drizzle-orm/pg-core';

import { createId } from '@/db/id';

export const book = pgTable(
  'book',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    title: text('title').notNull(),
    isbn: text('isbn').unique(),
    author: text('author'),
    publisher: text('publisher'),
    coverImageUrl: text('cover_image_url'),
    description: text('description'),
    // 建議售價（新台幣，整數，無小數）；實際成交價由該梯次的團購級距決定
    listPrice: integer('list_price').notNull(),
    // 適用課程/科目，例如「微積分」「普通物理學」
    subject: text('subject'),
    // 適用年級，例如「大一」「大二」；用文字保留彈性，各系年級命名不盡相同
    gradeLevel: text('grade_level'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('book_title_idx').on(table.title),
    index('book_gradeLevel_subject_idx').on(table.gradeLevel, table.subject),
    check('book_listPrice_check', sql`${table.listPrice} >= 0`),
  ],
);
