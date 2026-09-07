import { notFound } from 'next/navigation';
import { and, desc, eq, inArray, or } from 'drizzle-orm';

import { OrderStatusChip } from '@/components/order-status-chip';
import { RosterStatusBadge } from '@/components/roster-status-badge';
import { db, schema } from '@/db';
import { requireBatchStaffAccess } from '@/lib/batch/batch-access';
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
        {order.items.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between rounded-xl border border-black/10 px-4 py-3 text-sm dark:border-white/15"
          >
            <div>
              <p className="font-medium">{item.book.title}</p>
              <p className="text-xs text-zinc-500">
                {formatTWD(item.unitPrice)} × {item.quantity}
              </p>
            </div>
            <p className="font-medium">{formatTWD(item.subtotal)}</p>
          </li>
        ))}
      </ul>

      <div className="mt-4 mb-6 flex items-center justify-between rounded-xl border border-black/10 px-4 py-3 dark:border-white/15">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">總金額</span>
        <span className="text-lg font-semibold">
          {formatTWD(order.totalAmount)}
        </span>
      </div>

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
                </p>
                {Boolean(row.before || row.after || row.metadata) && (
                  <pre className="mt-1 overflow-x-auto rounded-md bg-black/4 p-2 whitespace-pre-wrap dark:bg-white/6">
                    {JSON.stringify(
                      {
                        before: row.before,
                        after: row.after,
                        metadata: row.metadata,
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
