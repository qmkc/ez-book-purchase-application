import { relations } from 'drizzle-orm';
import { pgTable, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

import { user } from '../auth/auth';
import { createId } from '../../id';

// 通用審計日誌，涵蓋 preorder/payment 狀態異動、梯次開關、書籍/團購級距調整、
// 使用者 role 變更等後台操作。entityType + entityId 指向被異動的那筆資料，
// 不建外鍵（同一個 log 表要能指到不同資料表），改由應用層保證寫入正確性。
export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    // 操作者；系統排程/webhook 觸發的自動異動允許為 null
    actorId: text('actor_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    // 例如 'preorder.status_changed'、'payment.refunded'、'preorder_batch.opened'、'user.role_changed'
    action: text('action').notNull(),
    // 被異動的資料表名稱，例如 'preorder'、'payment'、'preorder_batch'、'book'、'user'
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    // 異動前後的欄位快照（只放有變動的欄位即可），方便回溯與對帳
    before: jsonb('before'),
    after: jsonb('after'),
    // 其他上下文，例如取消/退款原因、來源 IP、請求備註
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('audit_log_entityType_entityId_idx').on(
      table.entityType,
      table.entityId,
    ),
    index('audit_log_actorId_idx').on(table.actorId),
    index('audit_log_action_idx').on(table.action),
    index('audit_log_createdAt_idx').on(table.createdAt),
  ],
);

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(user, {
    fields: [auditLog.actorId],
    references: [user.id],
  }),
}));
