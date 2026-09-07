import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Tailwind,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';

const BRAND_NAME = '校園教科書團購';

// 所有系統信共用的外層排版：品牌標頭 + 內容 + 統一的免責說明。用 Tailwind
// wrapper 讓信件排版沿用跟站內一樣的 utility class 寫法——寄送前
// @react-email/render 會把 class 轉成 inline style（大部分信箱不支援
// <style> 標籤，inline style 才是唯一穩妥的寫法，不用自己手動轉換）。
export function EmailLayout({
  preview,
  children,
}: {
  // 信箱清單畫面顯示的預覽摘要文字（不會顯示在信件內文裡）。
  preview: string;
  children: ReactNode;
}) {
  return (
    <Html lang="zh-TW">
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className="bg-zinc-50 py-10 font-sans">
          <Container className="mx-auto max-w-md rounded-xl border border-solid border-zinc-200 bg-white px-8 py-8">
            <Text className="m-0 mb-6 text-sm font-semibold tracking-tight text-zinc-900">
              {BRAND_NAME}
            </Text>
            {children}
            <Hr className="my-6 border-zinc-200" />
            <Text className="m-0 text-xs text-zinc-400">
              這是系統自動寄出的通知信，請勿直接回覆。
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
