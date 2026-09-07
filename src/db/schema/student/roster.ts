import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';

import { user } from '../auth/auth';
import { createId } from '../../id';

// 綁定時實際核對到的方式，只有 claimedByUserId 有值時才會有值：
// 'data'  — 手動輸入學號 + 真實姓名（可能是自報，不一定對得上匯入名單）
// 'email' — 使用已驗證的學校信箱（{student_id}@nfu.edu.tw）比對出學號，
//           不需要另外核對姓名——信箱本身已經是校方核發、經 OTP 驗證持有權
export const studentRosterClaimMethod = pgEnum('student_roster_claim_method', [
  'data',
  'email',
]);

// 學生名冊。可能來自兩種途徑：
// 1. 管理員批次匯入（依 studentId upsert，importedBy 有值）——校方提供的權威資料。
// 2. 學生自己綁定時填的資料，若當下查無對應的匯入資料，直接以自報內容建立一筆
//    （importedBy 為 null）——不擋下單，讓學生先能用，正確性留給管理員之後核實。
//
// 綁定不要求學號 + 姓名一定要對上既有匯入資料才能成功：對上就視為系統自動核實
// （見 verifiedAt 由程式當下直接填入），對不上或全新建立的自報資料則
// verifiedAt 先留空，由管理員在 /admin/roster 頁面人工核對後手動標記已核實
// （見 verifiedBy）。使用學校信箱（claimMethod='email'）比對出的綁定則視同
// 已核實，不需要管理員另外確認。
// 綁定成功/失敗的嘗試記錄寫入通用的 auditLog（entityType 'student_roster'），
// 不在這張表額外存嘗試次數。
export const studentRoster = pgTable(
  'student_roster',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    // 學號，匯入時的比對鍵，同一學號重複匯入視為更新
    studentId: text('student_id').notNull(),
    // 真實姓名；可能是管理員匯入的權威資料，也可能是學生自報、尚待核實的資料
    realName: text('real_name').notNull(),
    // 匯入此筆資料的管理員；null 代表這筆是學生自報建立、不是校方匯入
    importedBy: text('imported_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    // 完成綁定的使用者帳號；一筆名冊只能被一個帳號綁定，一個帳號也只能綁定一筆名冊
    claimedByUserId: text('claimed_by_user_id')
      .unique()
      .references(() => user.id, { onDelete: 'set null' }),
    claimedAt: timestamp('claimed_at'),
    claimMethod: studentRosterClaimMethod('claim_method'),
    // 這筆綁定是否已核實正確：'email' 方式綁定、或 'data' 方式但學號+姓名
    // 剛好對上既有匯入資料時，由程式自動填入（verifiedBy 留 null 代表系統
    // 自動核實）；其餘情況留空，等管理員人工核對後在後台標記
    // （見 admin/roster/actions.ts 的 verifyRosterClaim）。
    verifiedAt: timestamp('verified_at'),
    verifiedBy: text('verified_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    // 上次寄「還在等核實」提醒信（給學生本人 + 管理員）的時間，null 代表
    // 還沒寄過。只有在綁定超過一段時間仍未核實時才會寄，見
    // src/lib/roster-notifications.ts；用這欄位擋重複寄信，不會每次有人
    // 打開 /admin/roster 就重寄一次。
    notifiedAt: timestamp('notified_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('student_roster_studentId_uidx').on(table.studentId),
    index('student_roster_claimedByUserId_idx').on(table.claimedByUserId),
    check(
      'student_roster_studentId_check',
      sql`length(trim(${table.studentId})) > 0`,
    ),
    check(
      'student_roster_realName_check',
      sql`length(trim(${table.realName})) > 0`,
    ),
    // claimedByUserId 有值 <=> claimedAt 有值，不會只填一半
    check(
      'student_roster_claim_consistency_check',
      sql`(${table.claimedByUserId} is null) = (${table.claimedAt} is null)`,
    ),
    // claimMethod 只在完成綁定時才會有值，跟 claimedAt 同步
    check(
      'student_roster_claimMethod_check',
      sql`(${table.claimedAt} is null) = (${table.claimMethod} is null)`,
    ),
    // 沒有綁定就不可能核實過；核實一定發生在綁定之後
    check(
      'student_roster_verifiedAt_check',
      sql`${table.verifiedAt} is null or ${table.claimedAt} is not null`,
    ),
  ],
);

export const studentRosterRelations = relations(studentRoster, ({ one }) => ({
  importedByUser: one(user, {
    fields: [studentRoster.importedBy],
    references: [user.id],
    relationName: 'student_roster_importedBy',
  }),
  claimedByUser: one(user, {
    fields: [studentRoster.claimedByUserId],
    references: [user.id],
    relationName: 'student_roster_claimedBy',
  }),
  verifiedByUser: one(user, {
    fields: [studentRoster.verifiedBy],
    references: [user.id],
    relationName: 'student_roster_verifiedBy',
  }),
}));
