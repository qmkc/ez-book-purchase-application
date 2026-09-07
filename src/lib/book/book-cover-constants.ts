// 跟封面圖片上傳限制有關、client/server 兩邊都要用到的常數，特地不放
// book-cover.ts（那支有 'server-only'，client component 不能 import）。
export const MAX_COVER_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
export const ALLOWED_COVER_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
