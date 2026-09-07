'use client';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { useEffect, useMemo, useState, useTransition } from 'react';
import 'dayjs/locale/zh-tw';

// 跟著系統的深色模式設定走，跟站上其他地方用 `prefers-color-scheme` 的做法
// 一致（沒有另外做手動切換）。預設 false（亮色），掛載後才讀取實際偏好，
// 避免 SSR 跟 client 的判斷結果不一致造成 hydration 警告。
function usePrefersDarkMode() {
  const [prefersDark, setPrefersDark] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    startTransition(() => setPrefersDark(mediaQuery.matches));

    const handleChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersDark;
}

// 這個專案主體是 Tailwind，MUI 只在少數需要比較豐富互動元件的地方（例如日期
// 時間選擇器）局部引入，不整個 app 套用 MUI 主題/CssBaseline，避免跟既有的
// Tailwind 樣式打架。哪個頁面需要 MUI 元件，就在該頁面用這個 provider 包起來。
export function MuiProviders({ children }: { children: React.ReactNode }) {
  const prefersDark = usePrefersDarkMode();
  const theme = useMemo(
    () =>
      createTheme({
        palette: { mode: prefersDark ? 'dark' : 'light' },
        shape: { borderRadius: 8 },
      }),
    [prefersDark],
  );

  return (
    <AppRouterCacheProvider options={{ key: 'mui' }}>
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="zh-tw">
          {children}
        </LocalizationProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
