import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  text,
  integer,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  unique,
  check,
  foreignKey,
} from 'drizzle-orm/pg-core';

import { user } from '../auth/auth';
import { book } from '../book/book';
import { createId } from '../../id';

export const preorderBatchStatus = pgEnum('preorder_batch_status', [
  'draft',
  'open',
  'closed',
]);

// 付款狀態跟取貨狀態是兩個獨立的維度，故意拆成兩個 enum 而不是沿用舊的單一
// preorder_status（pending_payment/paid/fulfilled/cancelled 四選一）。舊的
// 設計把「有沒有收到錢」跟「書有沒有交出去」綁在同一個欄位上，遇到「先讓
// 學生取貨、錢晚點再收」（markFulfilled 的 allowUnpaid）這種現場常見情境就
// 詞窮了：訂單狀態只能是 fulfilled，完全看不出其實還沒收到錢，畫面上也無法
// 分開篩選/標示「已取貨但未付款」，而且一旦標成 fulfilled 之後系統就再也沒有
// 入口可以回頭補標付款（markPaid 舊版只接受 pending_payment）。拆開之後
// 「付款」「取貨」各自獨立推進，兩者可以同時處於任何組合；「取消」則維持用
// cancelledAt 是否有值來表示（本來就是獨立欄位，不需要另外建 enum）。
export const preorderPaymentStatus = pgEnum('preorder_payment_status', [
  'unpaid',
  'paid',
]);

export const preorderPickupStatus = pgEnum('preorder_pickup_status', [
  'pending',
  'fulfilled',
]);

export const paymentStatus = pgEnum('payment_status', [
  'pending',
  'succeeded',
  'failed',
  'refunded',
]);

export const preorderBatchStaffRole = pgEnum('preorder_batch_staff_role', [
  // 負責人，可以再新增/移除其他 assistant（僅應用層規則，DB 不強制）
  'owner',
  // 協助標記付款/取貨的一般承辦人員
  'assistant',
]);

// 必修/選修，只是顯示用的補充資訊，不影響任何預購邏輯
export const preorderBatchCourseType = pgEnum('preorder_batch_course_type', [
  'required',
  'elective',
]);

// 校內預購梯次，例如「2026 秋季教科書團購」。梯次常常就是對應到某一堂課的
// 教科書團購（見下面 instructorName 等課程資訊欄位），但這些欄位都是選填的
// 補充資訊，不是每個梯次都一定對應到單一課程（例如全校性的書展就不會填）。
export const preorderBatch = pgTable(
  'preorder_batch',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    name: text('name').notNull(),
    description: text('description'),
    startAt: timestamp('start_at').notNull(),
    // null 代表沒有設結束時間（長期開放），實際開放/結束仍以 status 為準，
    // 這欄位純粹是顯示用的預期期間
    endAt: timestamp('end_at'),
    status: preorderBatchStatus('status').default('draft').notNull(),
    // 授課老師姓名，例如「阮炳嵐」
    instructorName: text('instructor_name'),
    // 課號，例如「1918」
    courseCode: text('course_code'),
    courseType: preorderBatchCourseType('course_type'),
    // 上課地點，例如「文理及管理大樓 B1 CMAB102 階梯教室」
    location: text('location'),
    // 上課時間，用文字保留彈性（星期幾、第幾節的表示方式各校不盡相同），
    // 例如「禮拜四 2,3,4 節」
    classSchedule: text('class_schedule'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('preorder_batch_status_idx').on(table.status),
    check(
      'preorder_batch_endAt_check',
      sql`${table.endAt} is null or ${table.endAt} > ${table.startAt}`,
    ),
  ],
);

// 某梯次的權限白名單：只有列在這裡的人（或全域 role='admin'，app 層視為
// 超級使用者、不受此表限制）才能標記該梯次訂單的付款/取貨狀態。
// role 只是顯示用的區分（誰是負責人、誰是協助人員），實際權限一樣。
export const preorderBatchStaff = pgTable(
  'preorder_batch_staff',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    batchId: text('batch_id')
      .notNull()
      .references(() => preorderBatch.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: preorderBatchStaffRole('role').default('assistant').notNull(),
    // 指派此權限的人，帳號刪除時保留記錄、只把此欄位清空
    addedBy: text('added_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('preorder_batch_staff_batchId_userId_uidx').on(
      table.batchId,
      table.userId,
    ),
    index('preorder_batch_staff_userId_idx').on(table.userId),
  ],
);

// 某梯次開放預購的書籍，數量上限（覆寫 book.listPrice 的實際售價改由團購級距表決定）
export const preorderBatchBook = pgTable(
  'preorder_batch_book',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    batchId: text('batch_id')
      .notNull()
      .references(() => preorderBatch.id, { onDelete: 'cascade' }),
    bookId: text('book_id')
      .notNull()
      .references(() => book.id, { onDelete: 'cascade' }),
    // 預購數量上限，null 代表不限量
    quantityLimit: integer('quantity_limit'),
    // 是否仍開放預購這本書；已有訂單的話這筆列會被 preorderItem 的組合外鍵
    // 擋住而無法刪除，要下架一本書只能把這裡設 false，不能直接刪列
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // 用 unique() 而不是 uniqueIndex()：drizzle-kit 產生 migration 時，
    // CREATE TABLE 裡的 table-level unique constraint 會跟著表一起建立，
    // 順序早於後面的 ALTER TABLE ADD CONSTRAINT（組合外鍵要參照的
    // preorder_item_batchId_bookId_fk 就是指到這裡）；如果改用
    // uniqueIndex()，對應的 CREATE UNIQUE INDEX 會被排到所有外鍵之後，
    // 外鍵建立時找不到可參照的唯一鍵，migration 直接失敗
    unique('preorder_batch_book_batchId_bookId_uidx').on(
      table.batchId,
      table.bookId,
    ),
    index('preorder_batch_book_bookId_idx').on(table.bookId),
    check(
      'preorder_batch_book_quantityLimit_check',
      sql`${table.quantityLimit} is null or ${table.quantityLimit} > 0`,
    ),
  ],
);

// 團購價格級距：同一本書在此梯次「累積訂購數量」達到 minQuantity（含）以上時套用 price。
// 下單當下依目前累積數量（含本次訂購）取符合的最高門檻級距，價格即時浮動且成交即定案，
// 不會因梯次結束後的最終數量而回頭調整已成交的訂單。務必確保每個 batchBook 都有一筆
// minQuantity = 1 的基本級距做為預設價格。
export const preorderBatchBookPriceTier = pgTable(
  'preorder_batch_book_price_tier',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    batchBookId: text('batch_book_id')
      .notNull()
      .references(() => preorderBatchBook.id, { onDelete: 'cascade' }),
    minQuantity: integer('min_quantity').notNull(),
    price: integer('price').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('preorder_batch_book_price_tier_batchBookId_minQty_uidx').on(
      table.batchBookId,
      table.minQuantity,
    ),
    check(
      'preorder_batch_book_price_tier_minQuantity_check',
      sql`${table.minQuantity} >= 1`,
    ),
    check(
      'preorder_batch_book_price_tier_price_check',
      sql`${table.price} >= 0`,
    ),
  ],
);

// 學生帳號在某梯次下的預購單
export const preorder = pgTable(
  'preorder',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    batchId: text('batch_id')
      .notNull()
      .references(() => preorderBatch.id, { onDelete: 'restrict' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    paymentStatus: preorderPaymentStatus('payment_status')
      .default('unpaid')
      .notNull(),
    pickupStatus: preorderPickupStatus('pickup_status')
      .default('pending')
      .notNull(),
    // 下單當下計算好的總金額（新台幣，整數）
    totalAmount: integer('total_amount').notNull(),
    note: text('note'),
    // 取貨地點，例如「302 班導師代收」；由校方在標記 fulfilled 前後填寫
    pickupLocation: text('pickup_location'),
    fulfilledAt: timestamp('fulfilled_at'),
    // 標記取貨/成交的承辦人員，帳號刪除時保留記錄、只把此欄位清空
    fulfilledBy: text('fulfilled_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    cancelledAt: timestamp('cancelled_at'),
    cancelReason: text('cancel_reason'),
    cancelledBy: text('cancelled_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // 涵蓋單獨查 batchId，以及後台常見的「這個梯次裡付款/取貨狀態為 X 的
    // 訂單」查詢——兩個維度各自獨立，所以個別開一條索引，不是複合成一條。
    index('preorder_batchId_paymentStatus_idx').on(
      table.batchId,
      table.paymentStatus,
    ),
    index('preorder_batchId_pickupStatus_idx').on(
      table.batchId,
      table.pickupStatus,
    ),
    index('preorder_userId_idx').on(table.userId),
    // id 本身已經是 PK/唯一，這裡是刻意多開一個包含 batchId 的唯一鍵，
    // 純粹是為了讓 preorderItem 可以用 (preorderId, batchId) 組合外鍵指過來，
    // 逼資料庫保證明細上的 batchId 一定是該訂單真正所屬的梯次。用 unique()
    // 不是 uniqueIndex()，理由同 preorderBatchBook 那條（migration 順序）
    unique('preorder_id_batchId_uidx').on(table.id, table.batchId),
    check('preorder_totalAmount_check', sql`${table.totalAmount} >= 0`),
    // fulfilledAt 有值 <=> 取貨狀態就是 fulfilled，避免兩者不同步
    check(
      'preorder_fulfilledAt_check',
      sql`(${table.pickupStatus} = 'fulfilled') = (${table.fulfilledAt} is not null)`,
    ),
    // 一筆訂單不會同時「已取消」又「已取貨」——取消只允許在還沒交書之前
    // （見 cancelPreorderByStaff/cancelOwnPreorder 的應用層檢查），這裡在
    // 資料庫層也把這個不變量鎖住，不只是應用層自己小心
    check(
      'preorder_not_cancelled_and_fulfilled_check',
      sql`${table.cancelledAt} is null or ${table.pickupStatus} != 'fulfilled'`,
    ),
  ],
);

// 學生端顯示成 QR code 給承辦人員掃描的代碼用 JWT（HS256 簽章即可，payload
// 放 { sub: preorderId, iat, exp }），效期 90 秒（60 秒 client 刷新間隔 + 30
// 秒緩衝）。簽發、驗證都不用碰資料庫，也刻意不做「單次有效」的重放檢查——
// 掃到之後實際做的動作（標記付款/標記取貨）本來就是冪等的（見 preorder /
// payment 上 fulfilledAt / paidAt 那組 check），同一組碼在效期內被掃第二次
// 頂多看到「已經標記過了」，不會真的造成重複入帳或重複出貨。真正擋冒用的是
// 承辦人員當面核對本人，不是「這組碼只能用一次」，所以不需要額外一張表去記
// 「這個 jti 用掉了沒」。

// 預購單明細，unitPrice/subtotal 為下單當下快照，避免書價異動影響歷史訂單。
// batchId 是從 preorder.batchId 複製過來的冗余欄位，寫入時務必照抄父層的
// batchId，不要讓應用層自己另外決定——這欄位存在的唯一目的是配合下面兩條
// 組合外鍵，讓資料庫自己擋掉「明細的書其實不屬於這張單的梯次」這種錯誤。
export const preorderItem = pgTable(
  'preorder_item',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    preorderId: text('preorder_id').notNull(),
    batchId: text('batch_id').notNull(),
    bookId: text('book_id')
      .notNull()
      .references(() => book.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').default(1).notNull(),
    unitPrice: integer('unit_price').notNull(),
    subtotal: integer('subtotal').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    // 同一張預購單同一本書只能有一列，數量異動用更新既有列的 quantity，不新增列
    uniqueIndex('preorder_item_preorderId_bookId_uidx').on(
      table.preorderId,
      table.bookId,
    ),
    index('preorder_item_bookId_idx').on(table.bookId),
    check('preorder_item_quantity_check', sql`${table.quantity} > 0`),
    check('preorder_item_unitPrice_check', sql`${table.unitPrice} >= 0`),
    check('preorder_item_subtotal_check', sql`${table.subtotal} >= 0`),
    // batchId 必須是 preorderId 這張單真正所屬的梯次（見 preorder 的
    // (id, batchId) 唯一索引）；preorder 刪除時明細一併刪除
    foreignKey({
      name: 'preorder_item_preorderId_batchId_fk',
      columns: [table.preorderId, table.batchId],
      foreignColumns: [preorder.id, preorder.batchId],
    }).onDelete('cascade'),
    // (batchId, bookId) 必須是該梯次真的有開放預購的書（見 preorderBatchBook
    // 的唯一索引）；這條刻意不 cascade——已經有訂單的書，管理員要下架時會被
    // 這條擋下來，逼你在 preorderBatchBook 加「下架」欄位而不是直接刪列
    foreignKey({
      name: 'preorder_item_batchId_bookId_fk',
      columns: [table.batchId, table.bookId],
      foreignColumns: [preorderBatchBook.batchId, preorderBatchBook.bookId],
    }),
  ],
);

// 預購單的付款紀錄；method 先留 text 保彈性，之後接金流再視需要收斂成 enum
export const payment = pgTable(
  'payment',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    preorderId: text('preorder_id')
      .notNull()
      .references(() => preorder.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    method: text('method'),
    status: paymentStatus('status').default('pending').notNull(),
    transactionRef: text('transaction_ref'),
    paidAt: timestamp('paid_at'),
    // 標記付款完成的承辦人員（手動標記或掃 QR 都算，掃 QR 只是找到這筆
    // payment 的方式，標記動作本身一樣要記是誰按的）；帳號刪除時保留記錄、
    // 只把此欄位清空
    confirmedBy: text('confirmed_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    // 退款明細；狀態為 refunded 時應一併填上，金額允許小於 amount（部分退款）
    refundedAmount: integer('refunded_amount'),
    refundReason: text('refund_reason'),
    refundedAt: timestamp('refunded_at'),
    refundedBy: text('refunded_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index('payment_preorderId_idx').on(table.preorderId),
    index('payment_status_idx').on(table.status),
    check('payment_amount_check', sql`${table.amount} > 0`),
    check(
      'payment_refundedAmount_check',
      sql`${table.refundedAmount} is null or (${table.refundedAmount} >= 0 and ${table.refundedAmount} <= ${table.amount})`,
    ),
    // 退款金額、退款原因、退款時間要嘛一起有值要嘛一起是 null，不會只填一半
    check(
      'payment_refund_consistency_check',
      sql`(${table.refundedAmount} is null) = (${table.refundedAt} is null)`,
    ),
    // status = refunded <=> 有退款時間；succeeded/refunded 才會有 paidAt
    check(
      'payment_refundedAt_check',
      sql`(${table.status} = 'refunded') = (${table.refundedAt} is not null)`,
    ),
    check(
      'payment_paidAt_check',
      sql`(${table.status} in ('succeeded', 'refunded')) = (${table.paidAt} is not null)`,
    ),
  ],
);

export const bookRelations = relations(book, ({ many }) => ({
  batchBooks: many(preorderBatchBook),
  items: many(preorderItem),
}));

export const preorderBatchRelations = relations(preorderBatch, ({ many }) => ({
  batchBooks: many(preorderBatchBook),
  preorders: many(preorder),
  staff: many(preorderBatchStaff),
}));

export const preorderBatchStaffRelations = relations(
  preorderBatchStaff,
  ({ one }) => ({
    batch: one(preorderBatch, {
      fields: [preorderBatchStaff.batchId],
      references: [preorderBatch.id],
    }),
    user: one(user, {
      fields: [preorderBatchStaff.userId],
      references: [user.id],
      relationName: 'preorder_batch_staff_user',
    }),
    addedByUser: one(user, {
      fields: [preorderBatchStaff.addedBy],
      references: [user.id],
      relationName: 'preorder_batch_staff_addedBy',
    }),
  }),
);

export const preorderBatchBookRelations = relations(
  preorderBatchBook,
  ({ one, many }) => ({
    batch: one(preorderBatch, {
      fields: [preorderBatchBook.batchId],
      references: [preorderBatch.id],
    }),
    book: one(book, {
      fields: [preorderBatchBook.bookId],
      references: [book.id],
    }),
    priceTiers: many(preorderBatchBookPriceTier),
  }),
);

export const preorderBatchBookPriceTierRelations = relations(
  preorderBatchBookPriceTier,
  ({ one }) => ({
    batchBook: one(preorderBatchBook, {
      fields: [preorderBatchBookPriceTier.batchBookId],
      references: [preorderBatchBook.id],
    }),
  }),
);

export const preorderRelations = relations(preorder, ({ one, many }) => ({
  batch: one(preorderBatch, {
    fields: [preorder.batchId],
    references: [preorderBatch.id],
  }),
  user: one(user, {
    fields: [preorder.userId],
    references: [user.id],
    relationName: 'preorder_orderer',
  }),
  fulfilledByUser: one(user, {
    fields: [preorder.fulfilledBy],
    references: [user.id],
    relationName: 'preorder_fulfilledBy',
  }),
  cancelledByUser: one(user, {
    fields: [preorder.cancelledBy],
    references: [user.id],
    relationName: 'preorder_cancelledBy',
  }),
  items: many(preorderItem),
  payments: many(payment),
}));

export const preorderItemRelations = relations(preorderItem, ({ one }) => ({
  preorder: one(preorder, {
    fields: [preorderItem.preorderId],
    references: [preorder.id],
  }),
  book: one(book, {
    fields: [preorderItem.bookId],
    references: [book.id],
  }),
}));

export const paymentRelations = relations(payment, ({ one }) => ({
  preorder: one(preorder, {
    fields: [payment.preorderId],
    references: [preorder.id],
  }),
  confirmedByUser: one(user, {
    fields: [payment.confirmedBy],
    references: [user.id],
    relationName: 'payment_confirmedBy',
  }),
  refundedByUser: one(user, {
    fields: [payment.refundedBy],
    references: [user.id],
    relationName: 'payment_refundedBy',
  }),
}));
