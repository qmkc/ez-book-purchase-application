'use client';

import { usePathname } from 'next/navigation';

// 給放在 root layout、理論上「每個地方都要出現」的東西用——但少數頁面本身
// 就是在做那件事、再疊一層提醒反而多餘（例如 RosterReminderBanner 疊在
// /bind-roster 頁面上）。layout 是 server component 拿不到目前路徑，所以用
// 這層 client 包裝在瀏覽器端判斷要不要整個不渲染。
export function HideOnPath({
  paths,
  children,
}: {
  paths: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (paths.includes(pathname)) return null;
  return <>{children}</>;
}
