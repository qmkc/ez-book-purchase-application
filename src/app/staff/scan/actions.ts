'use server';

import { and, desc, eq, ilike, inArray, ne, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { db, schema } from '@/db';
import { writeAuditLog } from '@/lib/audit';
import { requireRole } from '@/lib/auth/session';
import {
  listAccessibleBatchIds,
  requireBatchesStaffAccess,
} from '@/lib/batch/batch-access';
import { deriveOrderStatusKey } from '@/lib/order-status';
import { verifyPreorderCode } from '@/lib/qr-token';
import {
  getRosterInfoByUserId,
  type RosterVerificationStatus,
} from '@/lib/roster/roster-lookup';

const SOURCE = '聯合掃描';

export type ScannableBatch = {
  id: string;
  name: string;
  status: 'draft' | 'open' | 'closed';
};

// 給「聯合模式」的梯次選擇器用：只列出目前使用者有權限承辦的梯次（admin
// 看全部）。草稿梯次還沒真的開放收單、不會有訂單，排除掉。
export async function getScannableBatches(): Promise<ScannableBatch[]> {
  const session = await requireRole(['staff', 'admin']);
  const accessibleIds = await listAccessibleBatchIds(
    session.user.id,
    session.user.role as string,
  );
  const notDraft = ne(schema.preorderBatch.status, 'draft');

  if (accessibleIds !== null && accessibleIds.length === 0) return [];

  return db
    .select({
      id: schema.preorderBatch.id,
      name: schema.preorderBatch.name,
      status: schema.preorderBatch.status,
    })
    .from(schema.preorderBatch)
    .where(
      accessibleIds === null
        ? notDraft
        : and(inArray(schema.preorderBatch.id, accessibleIds), notDraft),
    )
    .orderBy(desc(schema.preorderBatch.createdAt));
}

export type CombinedOrderEntry = {
  batchId: string;
  batchName: string;
  preorderId: string;
  paymentStatus: 'unpaid' | 'paid';
  pickupStatus: 'pending' | 'fulfilled';
  cancelledAt: string | null;
  totalAmount: number;
  items: { title: string; quantity: number; unitPrice: number }[];
};

export type CombinedScanSummary = {
  studentName: string;
  realName: string | null;
  studentEmail: string;
  studentId: string | null;
  rosterVerificationStatus: RosterVerificationStatus;
  // 學生在承辦人員「所有有權限的梯次」（不只是上方合併範圍勾選的那幾個）
  // 名下的每一筆訂單；沒下單的梯次不會有對應的列，不會硬塞一筆空訂單進
  // 來。哪幾筆要納入本次批次動作、哪幾筆只是給承辦人員參考，由前端依上方
  // 勾選狀態＋使用者手動調整的 checkbox 決定，不在這裡篩選。
  orders: CombinedOrderEntry[];
};

// lookupCombinedOrderByCode（掃 QR code）跟 lookupCombinedOrderByStudentUserId
// （管理員直接搜尋指定人員）找到學生之後，剩下「查這個人在有權限梯次內的
// 所有訂單、組成摘要」這段完全一樣，抽出來共用。accessibleBatchIds 為
// null 代表不限（admin）。
async function buildCombinedSummary(
  studentUserId: string,
  accessibleBatchIds: string[] | null,
  // 掃 QR code 進來時，這筆才是承辦人員手上實際在對的那一筆——排到清單
  // 最前面，不用在一堆梯次裡面找哪筆才是剛剛掃到的。搜尋選人進來的沒有
  // 「掃到哪一筆」這個概念，不傳就維持原本依梯次名稱排序。
  scannedPreorderId?: string,
): Promise<{ ok: false; error: string } | { ok: true; summary: CombinedScanSummary }> {
  const [orders, user, roster] = await Promise.all([
    db.query.preorder.findMany({
      where: (row, { and, eq, inArray }) =>
        accessibleBatchIds === null
          ? eq(row.userId, studentUserId)
          : and(
              eq(row.userId, studentUserId),
              inArray(row.batchId, accessibleBatchIds),
            ),
      with: { items: { with: { book: true } }, batch: true },
    }),
    db.query.user.findFirst({
      where: (row, { eq }) => eq(row.id, studentUserId),
    }),
    getRosterInfoByUserId(studentUserId),
  ]);
  if (!user) return { ok: false, error: '找不到此學生帳號' };

  const entries: CombinedOrderEntry[] = orders
    .map((order) => ({
      batchId: order.batchId,
      batchName: order.batch.name,
      preorderId: order.id,
      paymentStatus: order.paymentStatus,
      pickupStatus: order.pickupStatus,
      cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
      totalAmount: order.totalAmount,
      items: order.items.map((item) => ({
        title: item.book.title,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    }))
    .sort((a, b) => a.batchName.localeCompare(b.batchName, 'zh-Hant'));

  if (scannedPreorderId) {
    // 穩定排序（V8/Node 保證 Array#sort 穩定），只把掃到的那一筆挑到最前
    // 面，其他維持原本依梯次名稱排序的相對順序。
    entries.sort((a, b) => {
      if (a.preorderId === scannedPreorderId) return -1;
      if (b.preorderId === scannedPreorderId) return 1;
      return 0;
    });
  }

  return {
    ok: true,
    summary: {
      studentName: user.name,
      realName: roster?.realName ?? null,
      studentEmail: user.email,
      studentId: roster?.studentId ?? null,
      rosterVerificationStatus: roster?.verificationStatus ?? 'unbound',
      orders: entries,
    },
  };
}

// 掃描/貼上學生出示的代碼（代碼本身只對應到「一筆」訂單，見 qr-token.ts），
// 找出這筆訂單的學生是誰之後，回頭查這位學生在「承辦人員所有有權限的梯
// 次」名下的每一筆訂單，合併成一份摘要——不侷限在 selectedBatchIds（上方
// 合併範圍）內，是為了讓承辦人員能看到學生在其他梯次是否已經付款/取貨過，
// 避免重複收款或重複發書；selectedBatchIds 只用來決定哪些訂單「預設」會
// 被畫面上的批次動作勾選。
export async function lookupCombinedOrderByCode(
  selectedBatchIds: string[],
  code: string,
): Promise<
  { ok: false; error: string } | { ok: true; summary: CombinedScanSummary }
> {
  if (selectedBatchIds.length === 0) {
    return { ok: false, error: '請先選擇要合併收款/核對的梯次' };
  }
  const session = await requireBatchesStaffAccess(selectedBatchIds);

  const result = await verifyPreorderCode(code.trim());
  if ('error' in result) return { ok: false, error: result.error };

  const scannedOrder = await db.query.preorder.findFirst({
    where: (row, { eq }) => eq(row.id, result.preorderId),
  });
  if (!scannedOrder) return { ok: false, error: '找不到此訂單' };

  const accessibleBatchIds = await listAccessibleBatchIds(
    session.user.id,
    session.user.role as string,
  );
  if (
    accessibleBatchIds !== null &&
    !accessibleBatchIds.includes(scannedOrder.batchId)
  ) {
    return { ok: false, error: '此代碼所屬的梯次您沒有權限處理' };
  }

  return buildCombinedSummary(
    scannedOrder.userId,
    accessibleBatchIds,
    scannedOrder.id,
  );
}

export type StudentSearchResult = {
  userId: string;
  name: string;
  email: string;
  studentId: string | null;
  realName: string | null;
  verificationStatus: RosterVerificationStatus;
};

const MAX_SEARCH_RESULTS = 8;

// 「直接搜尋特定人員」只給管理員用——一般承辦人員仍然只能透過掃描 QR
// code 找到學生，不能任意用學號/姓名/email 查詢全校學生名單（避免超出
// 現場核對書籤所需的最小權限）。admin 本來就對全部梯次、全部學生有完整
// 存取權，這條路徑純粹是操作上的方便：例如學生沒帶手機、QR code 秀不出
// 來時，用學號或姓名直接查人。
export async function searchStudentsForCombinedScan(
  query: string,
): Promise<StudentSearchResult[]> {
  await requireRole(['admin']);

  const q = query.trim();
  if (q.length < 2) return [];

  const rows = await db
    .select({
      userId: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      studentId: schema.studentRoster.studentId,
      realName: schema.studentRoster.realName,
      verifiedAt: schema.studentRoster.verifiedAt,
    })
    .from(schema.user)
    .leftJoin(
      schema.studentRoster,
      eq(schema.studentRoster.claimedByUserId, schema.user.id),
    )
    .where(
      and(
        eq(schema.user.role, 'student'),
        or(
          ilike(schema.user.name, `%${q}%`),
          ilike(schema.user.email, `%${q}%`),
          ilike(schema.studentRoster.studentId, `%${q}%`),
          ilike(schema.studentRoster.realName, `%${q}%`),
        ),
      ),
    )
    .orderBy(schema.user.name)
    .limit(MAX_SEARCH_RESULTS);

  return rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    email: row.email,
    studentId: row.studentId,
    realName: row.realName,
    verificationStatus: row.studentId
      ? row.verifiedAt
        ? 'verified'
        : 'unverified'
      : 'unbound',
  }));
}

// 管理員直接指定學生（不透過掃描代碼）：admin 沒有梯次白名單限制
// （accessibleBatchIds 為 null），實際上看的就是這位學生在全部梯次的
// 訂單。
export async function lookupCombinedOrderByStudentUserId(
  studentUserId: string,
): Promise<
  { ok: false; error: string } | { ok: true; summary: CombinedScanSummary }
> {
  await requireRole(['admin']);
  return buildCombinedSummary(studentUserId, null);
}

// 一次把多筆訂單（橫跨不同梯次）標記為已付款。已取消或已付款的訂單直接
// 略過視為冪等，不會擋住其他還沒處理的訂單；每一筆真的有異動的訂單各自
// 開一筆 payment 交易、各自寫一筆稽核紀錄——聯合模式只是讓工作人員一次
// 按一個按鈕，資料庫裡仍然是每個梯次各自獨立的付款紀錄，跟分開掃描的結果
// 完全一致。
export async function markPaidCombined(
  preorderIds: string[],
): Promise<{ error?: string }> {
  if (preorderIds.length === 0) return { error: '沒有可標記的訂單' };

  const orders = await db.query.preorder.findMany({
    where: (row, { inArray }) => inArray(row.id, preorderIds),
    with: { payments: true },
  });
  if (orders.length === 0) return { error: '找不到訂單' };

  const batchIds = [...new Set(orders.map((order) => order.batchId))];
  const session = await requireBatchesStaffAccess(batchIds);

  for (const order of orders) {
    if (order.cancelledAt || order.paymentStatus === 'paid') continue; // 冪等

    const payment = order.payments[0];
    await db.transaction(async (tx) => {
      if (payment) {
        await tx
          .update(schema.payment)
          .set({
            status: 'succeeded',
            paidAt: new Date(),
            confirmedBy: session.user.id,
            // 見 batches/[batchId]/actions.ts 的 markPaid 同一段說明：重新
            // 標記為已付款時要清掉舊的退款欄位，否則會撞上
            // payment_refundedAt_check。
            refundedAmount: null,
            refundReason: null,
            refundedAt: null,
            refundedBy: null,
          })
          .where(eq(schema.payment.id, payment.id));
      } else {
        await tx.insert(schema.payment).values({
          preorderId: order.id,
          amount: order.totalAmount,
          status: 'succeeded',
          paidAt: new Date(),
          confirmedBy: session.user.id,
        });
      }
      await tx
        .update(schema.preorder)
        .set({ paymentStatus: 'paid' })
        .where(eq(schema.preorder.id, order.id));
    });

    await writeAuditLog({
      actorId: session.user.id,
      action: 'preorder.status_changed',
      entityType: 'preorder',
      entityId: order.id,
      before: { status: deriveOrderStatusKey(order) },
      after: {
        status: deriveOrderStatusKey({ ...order, paymentStatus: 'paid' }),
        source: SOURCE,
      },
    });

    revalidatePath(`/staff/batches/${order.batchId}`);
  }

  return {};
}

// 一次把多筆訂單標記為已取貨；跟單一梯次的 markFulfilled 一樣，未付款的
// 訂單預設要先跳確認框（allowUnpaid），這裡把「所有還沒處理、且未付款」
// 的梯次名稱一起回報給前端顯示，工作人員一次確認就能連同已付款的一起送出。
export async function markFulfilledCombined(
  preorderIds: string[],
  allowUnpaid: boolean = false,
): Promise<{ error?: string; unpaidBatchNames?: string[] }> {
  if (preorderIds.length === 0) return { error: '沒有可標記的訂單' };

  const orders = await db.query.preorder.findMany({
    where: (row, { inArray }) => inArray(row.id, preorderIds),
    with: { batch: true },
  });
  if (orders.length === 0) return { error: '找不到訂單' };

  const batchIds = [...new Set(orders.map((order) => order.batchId))];
  const session = await requireBatchesStaffAccess(batchIds);

  const actionable = orders.filter(
    (order) => !order.cancelledAt && order.pickupStatus !== 'fulfilled',
  );

  if (!allowUnpaid) {
    const unpaid = actionable.filter((order) => order.paymentStatus === 'unpaid');
    if (unpaid.length > 0) {
      return { unpaidBatchNames: unpaid.map((order) => order.batch.name) };
    }
  }

  for (const order of actionable) {
    await db
      .update(schema.preorder)
      .set({
        pickupStatus: 'fulfilled',
        fulfilledAt: new Date(),
        fulfilledBy: session.user.id,
      })
      .where(eq(schema.preorder.id, order.id));

    await writeAuditLog({
      actorId: session.user.id,
      action: 'preorder.status_changed',
      entityType: 'preorder',
      entityId: order.id,
      before: { status: deriveOrderStatusKey(order) },
      after: {
        status: deriveOrderStatusKey({ ...order, pickupStatus: 'fulfilled' }),
        markedUnpaid: order.paymentStatus === 'unpaid',
        source: SOURCE,
      },
    });

    revalidatePath(`/staff/batches/${order.batchId}`);
  }

  return {};
}
