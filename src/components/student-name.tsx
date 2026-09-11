// 承辦人員畫面上顯示學生姓名的共用元件：預設顯示名冊上的真實姓名，不顯示
// Google 帳號名稱（可能是綽號、非中文拼音等，跟點名/核對身分沒有直接關係）；
// 滑鼠移上去（title tooltip）才看得到 Google 帳號名稱，需要時仍查得到。
// 還沒綁定名冊、查無真實姓名時，退回顯示 Google 帳號名稱並加註記，讓承辦
// 人員知道這筆是「查無資料」，不是名冊上真的叫這個名字。
export function StudentName({
  realName,
  googleName,
  className,
}: {
  realName: string | null;
  googleName: string;
  className?: string;
}) {
  if (realName === null) {
    return (
      <span className={className}>
        {googleName}
        <span className="ml-1 text-[10px] text-amber-700 dark:text-amber-400">
          （未綁定名冊）
        </span>
      </span>
    );
  }

  return (
    <span className={className} title={`Google 帳號名稱：${googleName}`}>
      {realName}
    </span>
  );
}
