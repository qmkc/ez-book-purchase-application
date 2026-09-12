'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { OrderStatusChip } from '@/components/order-status-chip';
import {
  ROSTER_VERIFICATION_LABEL,
  RosterStatusBadge,
} from '@/components/roster-status-badge';
import { StudentName } from '@/components/student-name';
import { downloadCsv } from '@/lib/csv';
import { formatDateTime, formatTWD } from '@/lib/format';
import {
  deriveOrderStatusKey,
  ORDER_STATUS_LABEL,
  type OrderStatusKey,
} from '@/lib/order-status';
import type { RosterVerificationStatus } from '@/lib/roster/roster-lookup';

const STATUS_FILTERS: { value: OrderStatusKey | 'all'; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending_payment', label: '待付款' },
  { value: 'paid', label: '已付款' },
  { value: 'fulfilled', label: '已取貨' },
  { value: 'fulfilled_unpaid', label: '已取貨（未付款）' },
  { value: 'cancelled', label: '已取消' },
];

const PAGE_SIZE = 20;

type SortKey =
  | 'studentName'
  | 'studentId'
  | 'totalAmount'
  | 'status'
  | 'createdAt';
type SortDir = 'asc' | 'desc';

// 跟 STATUS_FILTERS（扣掉「全部」）同一個順序，讓「依狀態排序」大致依照
// 處理流程先後（待付款 → 已付款 → 已取貨…），不是單純字母序（那樣會把
// cancelled 排到最前面，觀感上很奇怪）。
const STATUS_RANK: Record<OrderStatusKey, number> = {
  pending_payment: 0,
  paid: 1,
  fulfilled: 2,
  fulfilled_unpaid: 3,
  cancelled: 4,
};

// 每欄第一次點擊時要用的方向：文字/狀態類欄位習慣由小到大（A→Z、流程前段
// →後段），金額/時間類欄位習慣由大到小（先看金額最高/最新的），跟大部分
// 表格排序的直覺一致。再點第二次才是同一欄位內的 asc/desc 切換。
const DEFAULT_SORT_DIR: Record<SortKey, SortDir> = {
  studentName: 'asc',
  studentId: 'asc',
  status: 'asc',
  totalAmount: 'desc',
  createdAt: 'desc',
};

const SORT_LABEL: Record<SortKey, string> = {
  studentName: '學生',
  studentId: '學號 / 認證狀態',
  totalAmount: '金額',
  status: '狀態',
  createdAt: '建立時間',
};

const SORT_COLUMNS: SortKey[] = [
  'studentName',
  'studentId',
  'totalAmount',
  'status',
  'createdAt',
];

export type StaffOrderRow = {
  id: string;
  // Google 帳號名稱，僅作為 hover tooltip 及未綁定名冊時的退回顯示（見
  // components/student-name.tsx），列表主要顯示/搜尋/排序用 realName。
  studentName: string;
  // 名冊上的真實姓名；null 代表尚未綁定名冊，查無資料。
  realName: string | null;
  studentEmail: string;
  studentId: string | null;
  rosterVerificationStatus: RosterVerificationStatus;
  totalAmount: number;
  paymentStatus: 'unpaid' | 'paid';
  pickupStatus: 'pending' | 'fulfilled';
  cancelledAt: string | Date | null;
  createdAt: string | Date;
};

// 列表實際顯示/搜尋/排序用的姓名：優先用名冊真實姓名，查無資料才退回
// Google 帳號名稱（跟 StudentName 元件的顯示邏輯一致）。
function displayName(order: Pick<StaffOrderRow, 'studentName' | 'realName'>) {
  return order.realName ?? order.studentName;
}

const EXPORT_HEADER = [
  '姓名',
  '學號',
  '名冊核實狀態',
  'Email',
  '金額',
  '狀態',
  '建立時間',
  '訂單編號',
];

// 匯出用的欄位跟畫面表格故意不完全一樣：姓名沒綁定名冊時額外註記（比照
// StudentName 元件的顯示邏輯），金額用純數字（不是 formatTWD 的「NT$1,234」
// 字串）方便匯入 Excel 後直接加總，不用先清格式。
function toExportRow(order: StaffOrderRow): string[] {
  const name =
    order.realName === null
      ? `${order.studentName}（未綁定名冊）`
      : order.realName;
  return [
    name,
    order.studentId ?? '',
    ROSTER_VERIFICATION_LABEL[order.rosterVerificationStatus],
    order.studentEmail,
    String(order.totalAmount),
    ORDER_STATUS_LABEL[deriveOrderStatusKey(order)],
    formatDateTime(order.createdAt),
    order.id,
  ];
}

function sortOrders(
  rows: StaffOrderRow[],
  key: SortKey,
  dir: SortDir,
): StaffOrderRow[] {
  const dirMul = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === 'studentId') {
      // 沒有學號（自報綁定但查無對應名冊資料）的排最後，不受排序方向
      // 影響——語意上是「還缺資料」，排最後比較符合直覺，不會切成 desc
      // 就跑到最前面看起來像優先要處理。
      if (a.studentId === null && b.studentId === null) return 0;
      if (a.studentId === null) return 1;
      if (b.studentId === null) return -1;
      return a.studentId.localeCompare(b.studentId) * dirMul;
    }
    if (key === 'studentName') {
      return displayName(a).localeCompare(displayName(b), 'zh-Hant') * dirMul;
    }
    if (key === 'totalAmount') {
      return (a.totalAmount - b.totalAmount) * dirMul;
    }
    if (key === 'status') {
      return (
        (STATUS_RANK[deriveOrderStatusKey(a)] -
          STATUS_RANK[deriveOrderStatusKey(b)]) *
        dirMul
      );
    }
    return (
      (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) *
      dirMul
    );
  });
}

// 承辦人員梯次頁的訂單列表：搜尋框輸入姓名/email 時，除了直接過濾下面的
// 表格，也會跳出一個下拉的「使用者搜尋」小組件（同一套視覺/互動邏輯跟
// 管理員新增承辦人員用的 UserSearchPicker 一致），點一下符合的人直接跳去
// 那筆訂單的詳情頁，不用自己在一長串表格裡找。資料本來就已經整批抓下來
// 了（單一梯次規模不大），搜尋/分頁都在前端做，不用另外打伺服器。
export function OrdersTable({
  orders,
  batchId,
  batchName,
}: {
  orders: StaffOrderRow[];
  batchId: string;
  // 只用來組匯出檔名，沒給就退回 batchId——不影響匯出功能本身。
  batchName?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatusKey | 'all'>(
    'all',
  );
  const [page, setPage] = useState(1);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const containerRef = useRef<HTMLDivElement>(null);

  // 同一欄再點一次切換 asc/desc；點別欄就換欄並用該欄的預設方向（見
  // DEFAULT_SORT_DIR），不會延用上一欄選的方向（例如剛看完「金額由高到低」
  // 換去點「學生」，理應是 A→Z，不是也給你「Z→A」）。
  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(DEFAULT_SORT_DIR[key]);
    }
  }

  // 匯出「所有」購買人資料：故意用完整的 orders（不是下面套用搜尋字/狀態
  // 篩選後的 filtered/sorted），不受畫面上目前的篩選條件影響——預設篩選會
  // 藏起已取消的訂單（見 filtered 的註解），但匯出給人力對帳/留存記錄用途
  // 時，這些還是要包含在內，不然容易誤以為「已取消」的訂單從沒發生過。
  function handleExport() {
    const rows = [EXPORT_HEADER, ...orders.map(toExportRow)];
    // 檔名用純數字的 yyyy-mm-dd（瀏覽器當地時區），不用 formatDateTime——
    // 那支是給畫面上人看的完整日期時間格式（含「上午/下午」等中文字），
    // 拿來組檔名不好處理特殊字元。
    const today = new Date().toLocaleDateString('sv-SE');
    // 梯次名稱是自由輸入的文字，可能含檔名系統不允許的字元（/ 尤其常見，
    // 例如「113/1 學期」），組檔名前先換成連字號，避免下載出來變成一個
    // 意外的子路徑或整段被瀏覽器丟棄。
    const safeBatchName = (batchName ?? batchId).replace(/[\\/:*?"<>|]/g, '-');
    downloadCsv(`${safeBatchName}-購買人資料-${today}.csv`, rows);
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const keyword = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return orders.filter((order) => {
      const key = deriveOrderStatusKey(order);
      // 「全部」預設不含已取消的訂單——已取消的訂單不用付款/不用交書，
      // 混在預設列表裡只會讓承辦人員誤以為還要處理；想看已取消的訂單另外
      // 點下面的「已取消」篩選即可，不是完全從畫面上消失。
      if (statusFilter === 'all') {
        if (key === 'cancelled') return false;
      } else if (key !== statusFilter) {
        return false;
      }
      if (!keyword) return true;
      return `${order.studentName} ${order.realName ?? ''} ${order.studentEmail} ${order.studentId ?? ''}`
        .toLowerCase()
        .includes(keyword);
    });
  }, [orders, keyword, statusFilter]);

  const sorted = useMemo(
    () => sortOrders(filtered, sortKey, sortDir),
    [filtered, sortKey, sortDir],
  );

  // 下拉挑人用的候選名單：只看姓名/email/學號是否符合，不管狀態篩選——搜尋是
  // 「幫你找到這個人」，不應該因為選了某個狀態篩選就找不到人。
  const pickerMatches = useMemo(() => {
    if (!keyword) return [];
    return orders
      .filter((o) =>
        `${o.studentName} ${o.realName ?? ''} ${o.studentEmail} ${o.studentId ?? ''}`
          .toLowerCase()
          .includes(keyword),
      )
      .slice(0, 8);
  }, [orders, keyword]);

  // 搜尋字/狀態篩選/排序一變動就跳回第一頁——用 React 官方建議的「render
  // 期間比對並同步」寫法（見 status-watcher.tsx 同樣手法），不用 effect：
  // 在 effect 裡呼叫 setState 屬於「多餘的 render」，這裡直接在 render
  // body 比對上一次的條件，變了就同一輪重新渲染時把頁碼撥回 1，不會先閃
  // 一次舊頁碼（換排序方式時如果留在原頁碼，看到的會是別批資料，很容易
  // 誤以為排序沒生效）。
  const filterKey = `${keyword} ${statusFilter} ${sortKey} ${sortDir}`;
  const [syncedFilterKey, setSyncedFilterKey] = useState(filterKey);
  if (filterKey !== syncedFilterKey) {
    setSyncedFilterKey(filterKey);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div ref={containerRef} className="relative w-full sm:max-w-xs">
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPickerOpen(Boolean(e.target.value.trim()));
            }}
            onFocus={() => query.trim() && setPickerOpen(true)}
            placeholder="搜尋學生姓名、email 或學號"
            autoComplete="off"
            className="w-full rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
          />
          {pickerOpen && keyword && (
            <ul className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-black/10 bg-zinc-50 py-1 shadow-lg dark:border-white/15 dark:bg-zinc-900">
              {pickerMatches.length === 0 ? (
                <li className="px-3 py-1.5 text-xs text-zinc-500">
                  沒有符合的學生
                </li>
              ) : (
                pickerMatches.map((order) => (
                  <li key={order.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPickerOpen(false);
                        router.push(
                          `/staff/batches/${batchId}/orders/${order.id}`,
                        );
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-black/4 dark:hover:bg-white/6"
                    >
                      <span className="min-w-0">
                        <StudentName
                          realName={order.realName}
                          googleName={order.studentName}
                          className="block truncate"
                        />
                        <span className="block truncate text-xs text-zinc-500">
                          {order.studentEmail}
                        </span>
                        <RosterStatusBadge
                          studentId={order.studentId}
                          verificationStatus={order.rosterVerificationStatus}
                          className="mt-1"
                        />
                      </span>
                      <OrderStatusChip
                        paymentStatus={order.paymentStatus}
                        pickupStatus={order.pickupStatus}
                        cancelledAt={order.cancelledAt}
                        className="shrink-0"
                      />
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                statusFilter === filter.value
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-black/15 text-zinc-600 hover:bg-black/4 dark:border-white/20 dark:text-zinc-400 dark:hover:bg-white/6'
              }`}
            >
              {filter.label}
            </button>
          ))}
          <button
            type="button"
            onClick={handleExport}
            disabled={orders.length === 0}
            title="匯出所有購買人資料，不受上方搜尋/篩選影響"
            className="ml-1 rounded-full border border-black/15 px-3 py-1 text-xs hover:bg-black/4 disabled:pointer-events-none disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/6"
          >
            匯出購買人資料
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/15">
        <table className="w-full min-w-160 text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-zinc-500 dark:border-white/15">
              {SORT_COLUMNS.map((key) => {
                const active = sortKey === key;
                return (
                  <th
                    key={key}
                    className="px-4 py-2 font-normal"
                    aria-sort={
                      active
                        ? sortDir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className={`inline-flex items-center gap-1 hover:text-foreground ${
                        active ? 'text-foreground' : ''
                      }`}
                    >
                      {SORT_LABEL[key]}
                      <span aria-hidden="true" className="text-[10px]">
                        {active ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                  沒有符合搜尋/篩選條件的訂單。
                </td>
              </tr>
            ) : (
              paged.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-black/5 last:border-0 dark:border-white/10"
                >
                  <td className="px-4 py-2">
                    <Link
                      href={`/staff/batches/${batchId}/orders/${order.id}`}
                      className="hover:underline"
                    >
                      <StudentName
                        realName={order.realName}
                        googleName={order.studentName}
                      />
                      <span className="ml-1 text-xs text-zinc-500">
                        {order.studentEmail}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <RosterStatusBadge
                      studentId={order.studentId}
                      verificationStatus={order.rosterVerificationStatus}
                    />
                  </td>
                  <td className="px-4 py-2">{formatTWD(order.totalAmount)}</td>
                  <td className="px-4 py-2">
                    <OrderStatusChip
                      paymentStatus={order.paymentStatus}
                      pickupStatus={order.pickupStatus}
                      cancelledAt={order.cancelledAt}
                    />
                  </td>
                  <td className="px-4 py-2 text-zinc-500">
                    {formatDateTime(order.createdAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-full border border-black/15 px-3 py-1 hover:bg-black/4 disabled:pointer-events-none disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/6"
          >
            上一頁
          </button>
          <span className="text-zinc-500">
            第 {page} / {totalPages} 頁（共 {sorted.length} 筆）
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-full border border-black/15 px-3 py-1 hover:bg-black/4 disabled:pointer-events-none disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/6"
          >
            下一頁
          </button>
        </div>
      )}
    </div>
  );
}
