import Link from 'next/link';
import { notFound } from 'next/navigation';

import { db } from '@/db';
import { BookCoverThumbnail } from '@/components/book-cover-thumbnail';
import { OrderStatusChip } from '@/components/order-status-chip';
import { QrCodeDisplay } from '@/components/qr-code-display';
import { getCumulativeQuantities } from '@/lib/batch/batch-catalog';
import { isBatchOrderable } from '@/lib/batch/lifecycle';
import { computeTierDiff } from '@/lib/batch/tier-diff';
import { formatDateTime, formatTWD } from '@/lib/format';
import { requireSession } from '@/lib/auth/session';

import { getOrderQrToken } from './actions';
import { CancelOrderButton } from './cancel-button';
import { EditableOrderItems } from './editable-order-items';
import { StatusWatcher } from './status-watcher';

export default async function OrderDetailPage({
  params,
}: PageProps<'/orders/[preorderId]'>) {
  const { preorderId } = await params;
  const session = await requireSession(`/orders/${preorderId}`);

  const order = await db.query.preorder.findFirst({
    where: (preorder, { eq }) => eq(preorder.id, preorderId),
    with: {
      batch: true,
      items: { with: { book: true } },
    },
  });

  if (!order || order.userId !== session.user.id) notFound();

  // 「完全還沒處理」：還可以改數量/取消的唯一狀態組合，付款/取貨任一個開始
  // 動了之後就不能再讓學生自己改，跟 updateOrderItemQuantities/
  // cancelOwnPreorder 的伺服器端檢查同一套規則。
  const isFullyPending =
    order.paymentStatus === 'unpaid' &&
    order.pickupStatus === 'pending' &&
    !order.cancelledAt;
  // 訂單狀態允許改，還要梯次本身仍在開放中（見 isBatchOrderable）——截止
  // 之後即使訂單本身「完全還沒處理」，也不能再讓學生自己改數量/取消，跟
  // updateOrderItemQuantities/cancelOwnPreorder 的伺服器端檢查同一套規則。
  const canModify = isFullyPending && isBatchOrderable(order.batch);
  const getToken = getOrderQrToken.bind(null, preorderId);

  // 只有還能改數量的畫面才需要「目前已預購 X 本」這個即時累積數字，讓學生
  // 調整數量時知道自己在團購級距的哪個位置；其餘狀態的訂單本來就不能再改，
  // 不用多查一次。
  const cumulative = canModify
    ? await getCumulativeQuantities(order.batchId)
    : null;

  // 已付款訂單付款當下鎖定的金額，可能因為梯次還開放中、之後有其他人
  // 下單/取消導致團購級距變動而跟「現在」不同了——只是顯示給學生知道，
  // 實際退款/補款由承辦人員在 staff 那邊處理，這裡沒有讓學生自己動的按鈕。
  const tierDiff =
    order.paymentStatus === 'paid' && !order.cancelledAt
      ? await computeTierDiff(order.batchId, order.items)
      : { items: [], amount: 0 };

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <StatusWatcher
        preorderId={order.id}
        initialPaymentStatus={order.paymentStatus}
        initialPickupStatus={order.pickupStatus}
        initialCancelledAt={
          order.cancelledAt ? order.cancelledAt.toISOString() : null
        }
      />
      <Link
        href={`/batches/${order.batchId}`}
        className="text-sm text-zinc-500 hover:underline"
      >
        {order.batch.name}
      </Link>
      <div className="mt-1 flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">訂單詳情</h1>
        <OrderStatusChip
          paymentStatus={order.paymentStatus}
          pickupStatus={order.pickupStatus}
          cancelledAt={order.cancelledAt}
          className="px-3 py-1 text-sm"
        />
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        建立於 {formatDateTime(order.createdAt)}
      </p>

      {!order.cancelledAt && (
        <div className="mt-6 flex justify-center rounded-xl border border-black/10 p-6 dark:border-white/15">
          <QrCodeDisplay getToken={getToken} />
        </div>
      )}

      {isFullyPending && !canModify && (
        <p className="mt-6 rounded-md border border-amber-600/30 bg-amber-600/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          此梯次已截止，無法再修改或取消訂單，如有需要請洽承辦人員。
        </p>
      )}

      {canModify ? (
        <EditableOrderItems
          preorderId={order.id}
          totalAmount={order.totalAmount}
          items={order.items.map((item) => ({
            id: item.id,
            bookId: item.bookId,
            title: item.book.title,
            coverImageUrl: item.book.coverImageUrl,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            subtotal: item.subtotal,
            alreadyOrdered: cumulative?.get(item.bookId) ?? item.quantity,
          }))}
        />
      ) : (
        <>
          <ul className="mt-6 flex flex-col gap-2">
            {order.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-black/10 px-4 py-3 text-sm dark:border-white/15"
              >
                <div className="flex items-center gap-3">
                  <BookCoverThumbnail
                    coverImageUrl={item.book.coverImageUrl}
                    title={item.book.title}
                    className="h-12 w-9"
                  />
                  <div>
                    <Link
                      href={`/books/${item.bookId}`}
                      className="font-medium hover:underline"
                    >
                      {item.book.title}
                    </Link>
                    <p className="text-xs text-zinc-500">
                      {formatTWD(item.unitPrice)} × {item.quantity}
                    </p>
                  </div>
                </div>
                <p className="font-medium">{formatTWD(item.subtotal)}</p>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-black/10 px-4 py-3 dark:border-white/15">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              總金額
            </span>
            <span className="text-lg font-semibold">
              {formatTWD(order.totalAmount)}
            </span>
          </div>

          {tierDiff.amount !== 0 && (
            <p className="mt-4 rounded-xl border border-amber-600/30 bg-amber-600/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              團購級距在您付款後又有變動，
              {tierDiff.amount > 0
                ? `目前可能需要再補繳 ${formatTWD(tierDiff.amount)}`
                : `目前可能可以退您 ${formatTWD(-tierDiff.amount)}`}
              ，請洽承辦人員辦理。
            </p>
          )}
        </>
      )}

      {order.pickupLocation && (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          取貨地點：{order.pickupLocation}
        </p>
      )}
      {order.cancelledAt && order.cancelReason && (
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          取消原因：{order.cancelReason}
        </p>
      )}

      {canModify && (
        <div className="mt-6">
          <CancelOrderButton preorderId={order.id} />
        </div>
      )}
    </main>
  );
}
