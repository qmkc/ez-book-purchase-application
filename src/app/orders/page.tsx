import { desc, eq } from 'drizzle-orm';

import { db, schema } from '@/db';
import { requireSession } from '@/lib/auth/session';

import { OrdersList } from './orders-list';

export default async function OrdersPage() {
  const session = await requireSession('/orders');

  const orders = await db.query.preorder.findMany({
    where: eq(schema.preorder.userId, session.user.id),
    orderBy: desc(schema.preorder.createdAt),
    with: { batch: true, items: { with: { book: true } } },
  });

  const rows = orders.map((order) => ({
    id: order.id,
    paymentStatus: order.paymentStatus,
    pickupStatus: order.pickupStatus,
    cancelledAt: order.cancelledAt,
    totalAmount: order.totalAmount,
    createdAt: order.createdAt,
    batchId: order.batchId,
    batchName: order.batch.name,
    books: order.items.map((item) => ({
      bookId: item.bookId,
      title: item.book.title,
      coverImageUrl: item.book.coverImageUrl,
    })),
  }));

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">我的訂單</h1>
      {orders.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          還沒有任何訂單。預購梯次不提供瀏覽，請使用梯次負責人（老師或承辦人員）提供的連結
          或 QR code 進入對應的預購頁面下單。
        </p>
      ) : (
        <OrdersList orders={rows} />
      )}
    </main>
  );
}
