import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';

import { BatchStatsPanel } from '@/components/batch-stats-panel';
import { SharePageQr } from '@/components/share-page-qr';
import { db, schema } from '@/db';
import { getBatchStats } from '@/lib/batch/batch-catalog';
import { requireBatchStaffAccess } from '@/lib/batch/batch-access';
import { getRosterInfoByUserIds } from '@/lib/roster/roster-lookup';

import { OrdersTable } from './orders-table';
import { ScanWidget } from './scan-widget';

export default async function StaffBatchDetailPage({
  params,
}: PageProps<'/staff/batches/[batchId]'>) {
  const { batchId } = await params;
  await requireBatchStaffAccess(batchId);

  const [batch] = await db
    .select()
    .from(schema.preorderBatch)
    .where(eq(schema.preorderBatch.id, batchId))
    .limit(1);
  if (!batch) notFound();

  const [orders, stats] = await Promise.all([
    db.query.preorder.findMany({
      where: eq(schema.preorder.batchId, batchId),
      orderBy: desc(schema.preorder.createdAt),
      with: { user: true },
    }),
    getBatchStats(batchId),
  ]);

  const rosterByUserId = await getRosterInfoByUserIds(
    orders.map((order) => order.userId),
  );

  return (
    <div>
      <div className="mb-1 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight wrap-break-word">
          {batch.name}
        </h1>
        <div className="shrink-0">
          <SharePageQr label="分享加入連結" path={`/batches/${batchId}`} />
        </div>
      </div>
      <p className="mb-6 text-sm text-zinc-500">共 {orders.length} 筆訂單</p>

      <div className="mb-6">
        <BatchStatsPanel stats={stats} />
      </div>

      <div className="mb-6">
        <ScanWidget batchId={batchId} />
      </div>

      <OrdersTable
        batchId={batchId}
        orders={orders.map((order) => {
          const roster = rosterByUserId.get(order.userId);
          return {
            id: order.id,
            studentName: order.user.name,
            studentEmail: order.user.email,
            studentId: roster?.studentId ?? null,
            rosterVerificationStatus: roster?.verificationStatus ?? 'unbound',
            totalAmount: order.totalAmount,
            paymentStatus: order.paymentStatus,
            pickupStatus: order.pickupStatus,
            cancelledAt: order.cancelledAt,
            createdAt: order.createdAt,
          };
        })}
      />
    </div>
  );
}
