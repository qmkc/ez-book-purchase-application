import { createAuthClient } from 'better-auth/react';
import {
  adminClient,
  emailOTPClient,
  lastLoginMethodClient,
} from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [adminClient(), lastLoginMethodClient(), emailOTPClient()],
});
