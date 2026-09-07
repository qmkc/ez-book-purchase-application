import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import { lastLoginMethod, oneTap } from 'better-auth/plugins';

import * as schema from '@/db/schema/auth/auth';
import { db } from '@/db';

// 只留 OAuth2 登入（Google 等），不開放 email/password 建帳號——沒有
// emailAndPassword 就沒有「這個信箱到底收不收得到信」的問題，社群登入本身
// 已經替我們驗證過信箱了（各 provider 給的 emailVerified 會直接信任，
// 見 better-auth 的 social sign-in 行為），所以也不需要另外掛
// emailOTP plugin 幫使用者驗證登入信箱。
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  baseURL: process.env.BETTER_AUTH_URL!,
  plugins: [
    admin({
      defaultRole: 'student',
      adminRoles: ['admin'],
    }),
    lastLoginMethod(),
    // Google One Tap：clientId 不用重複填，會直接吃下面
    // socialProviders.google.clientId。disableSignup 保持預設
    // false——One Tap 跟按鈕登入一樣，第一次登入直接建立新帳號。
    oneTap(),
  ],
  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
});
