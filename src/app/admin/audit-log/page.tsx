import Link from 'next/link';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';

import { db, schema } from '@/db';
import {
  AUDIT_ACTION_LABEL,
  AUDIT_ENTITY_TYPE_LABEL,
  formatAuditAction,
  formatAuditEntityType,
} from '@/lib/audit';
import { formatDateTime } from '@/lib/format';

import { AuditLogFilters } from './audit-log-filters';

const PAGE_SIZE = 50;

export default async function AuditLogPage({
  searchParams,
}: PageProps<'/admin/audit-log'>) {
  const params = await searchParams;
  const q = typeof params.q === 'string' ? params.q.trim() : '';
  const entityType =
    typeof params.entityType === 'string' ? params.entityType : 'all';
  const action = typeof params.action === 'string' ? params.action : 'all';
  const page = Math.max(1, Number(params.page) || 1);

  const conditions = [
    entityType !== 'all'
      ? eq(schema.auditLog.entityType, entityType)
      : undefined,
    action !== 'all' ? eq(schema.auditLog.action, action) : undefined,
    q
      ? or(
          ilike(schema.auditLog.entityId, `%${q}%`),
          ilike(schema.user.name, `%${q}%`),
          ilike(schema.user.email, `%${q}%`),
        )
      : undefined,
  ].filter(Boolean);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const baseQuery = db
    .select({
      id: schema.auditLog.id,
      action: schema.auditLog.action,
      entityType: schema.auditLog.entityType,
      entityId: schema.auditLog.entityId,
      before: schema.auditLog.before,
      after: schema.auditLog.after,
      metadata: schema.auditLog.metadata,
      createdAt: schema.auditLog.createdAt,
      actorName: schema.user.name,
      actorEmail: schema.user.email,
    })
    .from(schema.auditLog)
    .leftJoin(schema.user, eq(schema.auditLog.actorId, schema.user.id));

  const [rows, [{ total }]] = await Promise.all([
    baseQuery
      .where(where)
      .orderBy(desc(schema.auditLog.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: count() })
      .from(schema.auditLog)
      .leftJoin(schema.user, eq(schema.auditLog.actorId, schema.user.id))
      .where(where),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(targetPage: number) {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (entityType !== 'all') sp.set('entityType', entityType);
    if (action !== 'all') sp.set('action', action);
    if (targetPage > 1) sp.set('page', String(targetPage));
    const qs = sp.toString();
    return qs ? `/admin/audit-log?${qs}` : '/admin/audit-log';
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">稽核紀錄</h1>
      <p className="mb-6 text-sm text-zinc-500">
        所有後台/承辦操作（狀態強制切換、退款、名冊核實等等）都會留下紀錄，共{' '}
        {total} 筆
        {q || entityType !== 'all' || action !== 'all' ? '，符合篩選條件' : ''}
        。
      </p>

      <AuditLogFilters
        initialQuery={q}
        initialEntityType={entityType}
        initialAction={action}
        entityTypeOptions={Object.entries(AUDIT_ENTITY_TYPE_LABEL)}
        actionOptions={Object.entries(AUDIT_ACTION_LABEL)}
      />

      <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/15">
        <table className="w-full min-w-180 text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-zinc-500 dark:border-white/15">
              <th className="px-4 py-2 font-normal">時間</th>
              <th className="px-4 py-2 font-normal">操作者</th>
              <th className="px-4 py-2 font-normal">操作</th>
              <th className="px-4 py-2 font-normal">對象</th>
              <th className="px-4 py-2 font-normal">詳細內容</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                  沒有符合篩選條件的稽核紀錄。
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-black/5 align-top last:border-0 dark:border-white/10"
                >
                  <td className="px-4 py-2 whitespace-nowrap text-zinc-500">
                    {formatDateTime(row.createdAt)}
                  </td>
                  <td className="px-4 py-2">
                    {row.actorName ? (
                      <>
                        {row.actorName}
                        <span className="ml-1 text-xs text-zinc-500">
                          {row.actorEmail}
                        </span>
                      </>
                    ) : (
                      <span className="text-zinc-400">系統</span>
                    )}
                  </td>
                  <td className="px-4 py-2">{formatAuditAction(row.action)}</td>
                  <td className="px-4 py-2">
                    <span className="text-zinc-500">
                      {formatAuditEntityType(row.entityType)}
                    </span>
                    <span className="ml-1 font-mono text-xs text-zinc-400">
                      {row.entityId}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {row.before || row.after || row.metadata ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-zinc-500 underline">
                          查看
                        </summary>
                        <pre className="mt-1 max-w-xs overflow-x-auto rounded-md bg-black/4 p-2 text-xs whitespace-pre-wrap dark:bg-white/6">
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
                      </details>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <Link
            href={pageHref(page - 1)}
            aria-disabled={page <= 1}
            className={`rounded-full border px-3 py-1 ${
              page <= 1
                ? 'pointer-events-none border-black/10 text-zinc-400 dark:border-white/10'
                : 'border-black/15 hover:bg-black/4 dark:border-white/20 dark:hover:bg-white/6'
            }`}
          >
            上一頁
          </Link>
          <span className="text-zinc-500">
            第 {page} / {totalPages} 頁
          </span>
          <Link
            href={pageHref(page + 1)}
            aria-disabled={page >= totalPages}
            className={`rounded-full border px-3 py-1 ${
              page >= totalPages
                ? 'pointer-events-none border-black/10 text-zinc-400 dark:border-white/10'
                : 'border-black/15 hover:bg-black/4 dark:border-white/20 dark:hover:bg-white/6'
            }`}
          >
            下一頁
          </Link>
        </div>
      )}
    </div>
  );
}
