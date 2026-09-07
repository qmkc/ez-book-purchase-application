// 書籍封面縮圖，沒有圖的話顯示一個素色佔位框（不佔太多注意力，純粹是排版用）。
export function BookCoverThumbnail({
  coverImageUrl,
  title,
  className = 'h-16 w-12',
}: {
  coverImageUrl: string | null;
  title: string;
  className?: string;
}) {
  if (!coverImageUrl) {
    return (
      <div
        className={`shrink-0 rounded-md border border-black/10 bg-black/3 dark:border-white/15 dark:bg-white/5 ${className}`}
        aria-hidden="true"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 來源是我們自己的 route handler 或任意外部網址，不透過 next/image 最佳化
    <img
      src={coverImageUrl}
      alt={`《${title}》封面`}
      className={`shrink-0 rounded-md border border-black/10 object-cover dark:border-white/15 ${className}`}
    />
  );
}
