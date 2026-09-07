import { createAuthClient } from 'better-auth/react';
import {
  adminClient,
  lastLoginMethodClient,
  oneTapClient,
} from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [
    adminClient(),
    lastLoginMethodClient(),
    // Google Client ID 不是密鑰，本來就是要曝露給瀏覽器的（OAuth 的
    // client id 設計上就是公開資訊，機密的是 client secret，只留在
    // server 端的 auth.ts）。用 NEXT_PUBLIC_ 前綴才會被打進前端 bundle。
    oneTapClient({
      clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
    }),
  ],
});
