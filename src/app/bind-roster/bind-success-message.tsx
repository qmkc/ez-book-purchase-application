import Link from 'next/link';

// matched=true：學號＋姓名（或學校信箱）對上既有的匯入資料，已經核實完成。
// matched=false：資料庫目前查無這個學號，已經用您填寫的資料先建立暫時記錄，
// 正確性留給管理員之後人工核實——這個情況要讓使用者清楚看到，不能悄悄成功。
export function BindSuccessMessage({
  matched,
  next = '/',
}: {
  matched?: boolean;
  next?: string;
}) {
  return (
    <div className="rounded-md border border-green-600/30 bg-green-600/10 px-4 py-3 text-sm text-green-800 dark:text-green-400">
      {matched ? (
        <p>已完成綁定，資料與學校名冊相符，已自動核實。</p>
      ) : (
        <>
          <p className="font-medium">已完成綁定。</p>
          <p className="mt-1">
            但資料庫目前查無您填寫的學號，已先用您填寫的資料建立暫時記錄——不影響現在下單，
            管理員會之後人工核實；如果核實有問題會另行通知您。
          </p>
        </>
      )}
      <Link href={next} className="mt-2 inline-block font-medium underline">
        {next === '/' ? '回首頁' : '繼續前往原本要瀏覽的頁面'}
      </Link>
    </div>
  );
}
