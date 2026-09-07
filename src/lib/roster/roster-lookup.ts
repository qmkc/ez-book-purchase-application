import 'server-only';

import { inArray } from 'drizzle-orm';

import { db, schema } from '@/db';

export type RosterVerificationStatus = 'verified' | 'unverified' | 'unbound';

export type RosterInfo = {
  studentId: string;
  verificationStatus: RosterVerificationStatus;
};

// 承辦人員/管理員在各處看到的學生名單（梯次訂單列表、掃描核對面板、訂單
// 詳情……）都需要附上學號跟核實狀態，方便現場核對身分；不透過 user ->
// studentRoster 的 relation 撈（better-auth 產生的 auth.ts 是自動產生檔，
// 加在那邊的 relation 下次 `pnpm auth:gen` 會被整檔覆蓋沖掉），改成呼叫端
// 自己批次查一次、組成 Map 回去對應，各頁面用法見
// src/app/staff/batches/[batchId]/{page,actions}.tsx。
export async function getRosterInfoByUserIds(
  userIds: string[],
): Promise<Map<string, RosterInfo>> {
  if (userIds.length === 0) return new Map();

  const rows = await db
    .select({
      claimedByUserId: schema.studentRoster.claimedByUserId,
      studentId: schema.studentRoster.studentId,
      verifiedAt: schema.studentRoster.verifiedAt,
    })
    .from(schema.studentRoster)
    .where(inArray(schema.studentRoster.claimedByUserId, userIds));

  const map = new Map<string, RosterInfo>();
  for (const row of rows) {
    if (!row.claimedByUserId) continue; // 篩選條件已經限定，理論上不會發生
    map.set(row.claimedByUserId, {
      studentId: row.studentId,
      verificationStatus: row.verifiedAt ? 'verified' : 'unverified',
    });
  }
  return map;
}

// 單一使用者版本，給只需要查一個人的地方用（例如掃描核對面板一次只看一筆）。
export async function getRosterInfoByUserId(
  userId: string,
): Promise<RosterInfo | null> {
  const map = await getRosterInfoByUserIds([userId]);
  return map.get(userId) ?? null;
}
