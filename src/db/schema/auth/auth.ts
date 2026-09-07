import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    // 權限身分：admin（校方管理者）/ staff（承辦人員，可開梯次、標記付款與取貨）/ student（一般學生，預設）。
    // 這欄跟下面 banned/banReason/banExpires 都是 better-auth 的 admin plugin
    // 加的（見 src/lib/auth.ts 的 admin({ defaultRole: 'student', ... })），
    // 不是 additionalFields 手刻的，不要重複加。
    role: text('role').default('student').notNull(),
    // 是否被停權；停權中無法建立新 session（admin plugin 在 session create
    // 前會擋）。banReason/banExpires 只有透過 /admin/ban-user、
    // /admin/unban-user 這兩支 API 才保證成對變動（一起設、一起清空）；plugin
    // 另外還有 /admin/update-user 這種通用更新端點可以繞過那個配對邏輯直接
    // 改任一欄，所以這裡刻意不加「banned 和 banReason 要嘛一起有值要嘛一起
    // null」這種 check，會跟 plugin 自己的行為打架
    banned: boolean('banned').default(false).notNull(),
    banReason: text('ban_reason'),
    // null 代表永久停權
    banExpires: timestamp('ban_expires'),
    // username plugin 加的欄位，跟 email 並存、不是取代：使用者可以選擇要不要
    // 額外設 username 來登入。兩者都是 nullable + unique（沒設就是 null，
    // pg 允許多個 null 不違反 unique）。
    username: text('username').unique(),
    displayUsername: text('display_username'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // 注意：這條 check 跟本檔其他手動加的部分一樣，重新跑 `pnpm auth:gen`
    // 會整個檔案被覆蓋、需要手動補回來
    check(
      'user_role_check',
      sql`${table.role} in ('admin', 'staff', 'student')`,
    ),
  ],
);

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // admin plugin：這個 session 是不是 admin 透過 /admin/impersonate-user
    // 冒充出來的，有值就是被冒充帳號的 admin userId
    impersonatedBy: text('impersonated_by'),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    issuer: text('issuer').notNull(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('account_issuer_accountId_uidx').on(
      table.issuer,
      table.accountId,
    ),
    index('account_userId_idx').on(table.userId),
  ],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
