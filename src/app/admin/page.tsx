import { and, count, eq, isNull } from 'drizzle-orm';

import { db, schema } from '@/db';

export default async function AdminHomePage() {
  const [
    [bookCount],
    [openBatchCount],
    [pendingOrderCount],
    [unclaimedRosterCount],
  ] = await Promise.all([
    db.select({ value: count() }).from(schema.book),
    db
      .select({ value: count() })
      .from(schema.preorderBatch)
      .where(eq(schema.preorderBatch.status, 'open')),
    // 還沒收到錢、也還沒取消的訂單 刻意不排除已取貨的（allowUnpaid 先
    // 讓學生取貨、錢晚點再收的情況），這個數字才能真的反映還有多少錢沒收，
    // 不會因為書已經交出去就從這個提醒清單消失
    db
      .select({ value: count() })
      .from(schema.preorder)
      .where(
        and(
          eq(schema.preorder.paymentStatus, 'unpaid'),
          isNull(schema.preorder.cancelledAt),
        ),
      ),
    db
      .select({ value: count() })
      .from(schema.studentRoster)
      .where(isNull(schema.studentRoster.claimedByUserId)),
  ]);

  const stats = [
    { label: '書籍總數', value: bookCount.value },
    { label: '開放中梯次', value: openBatchCount.value },
    { label: '未收款訂單', value: pendingOrderCount.value },
    { label: '尚未綁定名冊', value: unclaimedRosterCount.value },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">後台總覽</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-black/10 p-5 dark:border-white/15"
          >
            <p className="text-sm text-zinc-500">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
