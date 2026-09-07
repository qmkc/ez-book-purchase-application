import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import { emailOTP, lastLoginMethod, username } from 'better-auth/plugins';

import * as schema from '@/db/schema/auth/auth';
import { sendOTPEmail } from '@/lib/email';
import { db } from '@/db';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  baseURL: process.env.BETTER_AUTH_URL!,
  emailAndPassword: { enabled: true },
  plugins: [
    admin({
      defaultRole: 'student',
      adminRoles: ['admin'],
    }),
    lastLoginMethod(),
    username(),
    emailOTP({
      sendVerificationOTP: ({ email, otp, type }) =>
        sendOTPEmail({ email, otp, type }),
      disableSignUp: true,
      // 註冊完成後自動寄一封「Email 驗證碼」信——但不設定
      // requireEmailVerification，所以這只是額外的、非強制的驗證，不會擋
      // 任何操作。使用者可以之後在個人頁面隨時重新發送/完成驗證。
      sendVerificationOnSignUp: true,
    }),
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
