"use client";

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';
import {
  AuthLayout,
  AuthContent,
  AuthSubtitle,
} from '@/components/auth/AuthLayout';

/**
 * SSO callback page — handles OAuth redirect after Google sign-in.
 *
 * Uses Clerk's AuthenticateWithRedirectCallback which handles both:
 * - Sign-in: existing accounts are authenticated
 * - Sign-up (transfer): new accounts are auto-created via the
 *   "transferable" mechanism when a Google account doesn't yet
 *   have a corresponding Clerk user
 *
 * Previous manual handleRedirectCallback() didn't handle the transfer
 * case, causing new accounts to silently redirect back to /sign-in.
 */
export default function SSOCallbackPage() {
  return (
    <AuthLayout>
      <AuthContent>
        <div className="relative shrink-0 w-12 h-12 rounded-xl bg-[rgba(174,96,248,0.3)] animate-pulse flex items-center justify-center text-white font-bold text-lg">
          HQ
        </div>
        <AuthSubtitle>Completing sign in...</AuthSubtitle>
      </AuthContent>
      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl="/agents"
        signUpForceRedirectUrl="/agents"
        signInUrl="/sign-in"
      />
    </AuthLayout>
  );
}
