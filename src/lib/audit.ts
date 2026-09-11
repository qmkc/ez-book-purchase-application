import 'server-only';

import { getIP } from '@better-auth/core/utils/ip';
import { headers } from 'next/headers';

import { auth } from '@/lib/auth/auth';
import { db, schema } from '@/db';

// 來源 IP／User-Agent 從當下請求的 headers 讀，跟 better-auth 自己記
// session.ipAddress 用同一套 getIP()（吃 auth.options 裡
// advanced.ipAddress 的 ipAddressHeaders/trustedProxies 設定，預設看
// x-forwarded-for），不用自己重刻一份判斷邏輯。headers() 只能在請求情境
// 下呼叫（server action / route handler / page render），目前所有
// writeAuditLog() 呼叫點都符合；萬一未來多了背景排程之類非請求情境下的
// 呼叫，這裡包一層 try/catch，抓不到就記 null，不會讓稽核紀錄本身寫入失敗。
async function getRequestContext(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  try {
    const h = await headers();
    return {
      ipAddress: getIP(h, auth.options),
      userAgent: h.get('user-agent'),
    };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

// action 字串到中文顯示文字的對照，給 /admin/audit-log 跟各處嵌入的稽核
// 紀錄摘要共用；沒列到的 action 直接顯示原始字串，不會壞掉，只是不夠好讀。
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  'preorder.created': '建立訂單',
  'preorder.merged': '合併加購',
  'preorder.items_updated': '訂單品項調整',
  'preorder.status_changed': '訂單狀態變更',
  'preorder.cancelled': '取消訂單',
  'payment.refunded': '退款／撤銷付款',
  'payment.tier_settled': '級距落差調整（退款／補款）',
  'preorder_batch.created': '建立梯次',
  'preorder_batch.updated': '編輯梯次資訊',
  'preorder_batch.status_changed': '梯次狀態變更',
  'preorder_batch_book.added': '加入書籍到梯次',
  'preorder_batch_book.active_changed': '書籍上/下架',
  'preorder_batch_book_price_tier.added': '新增團購級距',
  'preorder_batch_book_price_tier.updated': '修改團購級距',
  'preorder_batch_book_price_tier.deleted': '刪除團購級距',
  'preorder_batch_staff.added': '新增承辦人員',
  'preorder_batch_staff.removed': '移除承辦人員',
  'book.created': '建立書籍',
  'book.updated': '編輯書籍',
  'student_roster.imported': '匯入學生名冊',
  'student_roster.claimed': '綁定名冊',
  'student_roster.verified': '核實名冊',
  'student_roster.unverified': '取消核實名冊',
  'student_roster.merged': '合併並核實名冊（修正綁錯的學號）',
  'student_roster.pending_notified': '寄出逾期未核實提醒',
};

export function formatAuditAction(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? action;
}

// entityType 字串到中文顯示文字的對照，同樣沒列到就顯示原始字串。
export const AUDIT_ENTITY_TYPE_LABEL: Record<string, string> = {
  preorder: '訂單',
  payment: '付款紀錄',
  preorder_batch: '預購梯次',
  preorder_batch_book: '梯次書籍',
  preorder_batch_book_price_tier: '團購級距',
  preorder_batch_staff: '承辦人員',
  book: '書籍',
  student_roster: '學生名冊',
  user: '使用者',
};

export function formatAuditEntityType(entityType: string): string {
  return AUDIT_ENTITY_TYPE_LABEL[entityType] ?? entityType;
}

// 通用審計紀錄寫入。before/after 只放有變動的欄位就好，metadata 放備註等
// 其他上下文（來源 IP／User-Agent 是獨立欄位，見上面的 getRequestContext，
// 呼叫端不用自己傳）。actorId 為 null 代表系統排程/webhook 觸發。
export async function writeAuditLog({
  actorId,
  action,
  entityType,
  entityId,
  before,
  after,
  metadata,
}: {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}) {
  const { ipAddress, userAgent } = await getRequestContext();
  await db.insert(schema.auditLog).values({
    actorId,
    action,
    entityType,
    entityId,
    before: before ?? null,
    after: after ?? null,
    metadata: metadata ?? null,
    ipAddress,
    userAgent,
  });
}
