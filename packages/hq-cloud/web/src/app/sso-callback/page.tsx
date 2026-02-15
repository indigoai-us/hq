"use client";

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';
import {
  AuthLayout,
  AuthContent,
  AuthSubtitle,
} from '@/components/auth/AuthLayout';

export default function SSOCallbackPage() {
  return (
    <>
      <AuthenticateWithRedirectCallback />
      <AuthLayout>
        <AuthContent>
          <div className="relative shrink-0 w-12 h-12 rounded-xl bg-[rgba(174,96,248,0.3)] animate-pulse flex items-center justify-center text-white font-bold text-lg">
            HQ
          </div>
          <AuthSubtitle>Completing sign in...</AuthSubtitle>
        </AuthContent>
      </AuthLayout>
    </>
  );
}
