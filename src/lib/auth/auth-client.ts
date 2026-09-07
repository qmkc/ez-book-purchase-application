import { createAuthClient } from 'better-auth/react';
import {
  adminClient,
  emailOTPClient,
  lastLoginMethodClient,
  usernameClient,
} from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [
    adminClient(),
    lastLoginMethodClient(),
    usernameClient(),
    emailOTPClient(),
  ],
});
