import { notFound } from 'next/navigation';
import { and, desc, eq, inArray, or } from 'drizzle-orm';

import { OrderStatusChip } from '@/components/order-status-chip';
import { RosterStatusBadge } from '@/components/roster-status-badge';
import { db, schema } from '@/db';
import { requireBatchStaffAccess } from '@/lib/batch/batch-access';
import { computeTierDiff } from '@/lib/batch/tier-diff';
import { formatAuditAction } from '@/lib/audit';
import { formatDateTime, formatTWD } from '@/lib/format';
import { getRosterInfoByUserId } from '@/lib/roster/roster-lookup';

import { OrderActions } from './order-actions';

export default async function StaffOrderDetailPage({
  params,
}: PageProps<'/staff/batches/[batchId]/orders/[preorderId]'>) {
  const { batchId, preorderId } = await params;
  await requireBatchStaffAccess(batchId);

  const order = await db.query.preorder.findFirst({
    where: (row, { eq }) => eq(row.id, preorderId),
    with: {
      user: true,
      items: { with: { book: true } },
      payments: true,
    },
  });

  if (!order || order.batchId !== batchId) notFound();

  const roster = await getRosterInfoByUserId(order.userId);

  // 已付款訂單的單價在付款當下就凍結，不會再跟著團購級距浮動（見
  // src/lib/batch/resync-pricing.ts）；但團購人數在梯次還開放中可能繼續
  // 變動，付款時鎖定的金額跟「現在」的級距可能已經不同了。這裡把落差算
  // 出來顯示，並提供 settleTierDiff 讓承辦人員在現場實際退/收完差額之後，
  // 回來把訂單金額同步成目前的級距（見 lib/batch/tier-diff.ts 的說明）。
  const tierDiff =
    order.paymentStatus === 'paid' && !order.cancelledAt
      ? await computeTierDiff(batchId, order.items)
      : { items: [], amount: 0 };
  const priceMismatchByBookId = new Map(
    tierDiff.items.map((item) => [item.bookId, item.currentUnitPrice]),
  );

  // 這筆訂單相關的稽核紀錄：狀態變更寫在 entityType='preorder'，退款則是
  // 寫在 entityType='payment'（entityId 是 payment 那筆的 id，不是訂單 id），
  // 兩種都要撈出來才是這筆訂單完整的操作歷史。
  const paymentIds = order.payments.map((p) => p.id);
  const auditRows = await db
    .select({
      id: schema.auditLog.id,
      action: schema.auditLog.action,
      before: schema.auditLog.before,
      after: schema.auditLog.after,
      metadata: schema.auditLog.metadata,
      ipAddress: schema.auditLog.ipAddress,
      userAgent: schema.auditLog.userAgent,
      createdAt: schema.auditLog.createdAt,
      actorName: schema.user.name,
      actorEmail: schema.user.email,
    })
    .from(schema.auditLog)
    .leftJoin(schema.user, eq(schema.auditLog.actorId, schema.user.id))
    .where(
      or(
        and(
          eq(schema.auditLog.entityType, 'preorder'),
          eq(schema.auditLog.entityId, preorderId),
        ),
        paymentIds.length > 0
          ? and(
              eq(schema.auditLog.entityType, 'payment'),
              inArray(schema.auditLog.entityId, paymentIds),
            )
          : undefined,
      ),
    )
    .orderBy(desc(schema.auditLog.createdAt));

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm text-zinc-500">
        {order.user.name}（{order.user.email}）
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">訂單詳情</h1>
        <OrderStatusChip
          paymentStatus={order.paymentStatus}
          pickupStatus={order.pickupStatus}
          cancelledAt={order.cancelledAt}
          className="px-3 py-1 text-sm"
        />
        <RosterStatusBadge
          studentId={roster?.studentId ?? null}
          verificationStatus={roster?.verificationStatus ?? 'unbound'}
        />
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        建立於 {formatDateTime(order.createdAt)}
      </p>

      <ul className="mt-6 flex flex-col gap-2">
        {order.items.map((item) => {
          const currentPrice = priceMismatchByBookId.get(item.bookId);
          return (
            <li
              key={item.id}
              className="flex items-center justify-between rounded-xl border border-black/10 px-4 py-3 text-sm dark:border-white/15"
            >
              <div>
                <p className="font-medium">{item.book.title}</p>
                <p className="text-xs text-zinc-500">
                  {formatTWD(item.unitPrice)} × {item.quantity}
                </p>
                {currentPrice !== undefined && (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    目前團購價 {formatTWD(currentPrice)}，與此單付款時鎖定的
                    {formatTWD(item.unitPrice)} 不同
                  </p>
                )}
              </div>
              <p className="font-medium">{formatTWD(item.subtotal)}</p>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 mb-6 flex items-center justify-between rounded-xl border border-black/10 px-4 py-3 dark:border-white/15">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">總金額</span>
        <span className="text-lg font-semibold">
          {formatTWD(order.totalAmount)}
        </span>
      </div>

      {tierDiff.amount !== 0 && (
        <div className="mb-6 rounded-xl border border-amber-600/30 bg-amber-600/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          團購級距已變動，目前應付金額為{' '}
          {formatTWD(order.totalAmount + tierDiff.amount)}，
          {tierDiff.amount > 0
            ? `需向學生補收 ${formatTWD(tierDiff.amount)}`
            : `需退還學生 ${formatTWD(-tierDiff.amount)}`}
          。請先在現場實際退/收完款項，再用下方按鈕把訂單金額同步成目前的
          級距。
        </div>
      )}

      {order.pickupLocation && (
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          取貨地點：{order.pickupLocation}
        </p>
      )}
      {order.cancelledAt && order.cancelReason && (
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          取消原因：{order.cancelReason}
        </p>
      )}

      <OrderActions
        batchId={batchId}
        preorderId={preorderId}
        paymentStatus={order.paymentStatus}
        pickupStatus={order.pickupStatus}
        cancelledAt={order.cancelledAt}
        totalAmount={order.totalAmount}
        tierDiffAmount={tierDiff.amount}
      />

      {auditRows.length > 0 && (
        <details className="mt-6 border-t border-black/10 pt-4 dark:border-white/15">
          <summary className="cursor-pointer text-sm text-zinc-500 underline">
            此訂單的操作紀錄（共 {auditRows.length} 筆）
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {auditRows.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-black/10 px-3 py-2 text-xs dark:border-white/15"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {formatAuditAction(row.action)}
                  </span>
                  <span className="text-zinc-500">
                    {formatDateTime(row.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-zinc-500">
                  {row.actorName
                    ? `${row.actorName}（${row.actorEmail}）`
                    : '系統'}
                  {row.ipAddress && (
                    <span className="ml-1 font-mono">（{row.ipAddress}）</span>
                  )}
                </p>
                {Boolean(
                  row.before || row.after || row.metadata || row.userAgent,
                ) && (
                  <pre className="mt-1 overflow-x-auto rounded-md bg-black/4 p-2 whitespace-pre-wrap dark:bg-white/6">
                    {JSON.stringify(
                      {
                        before: row.before,
                        after: row.after,
                        metadata: row.metadata,
                        userAgent: row.userAgent,
                      },
                      null,
                      2,
                    )}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
