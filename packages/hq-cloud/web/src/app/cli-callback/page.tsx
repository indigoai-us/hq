"use client";

import { useAuth, useSignIn, useUser } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  AuthLayout,
  AuthContent,
  AuthTitle,
  AuthErrorTitle,
  AuthSubtitle,
  AuthButtonsContainer,
} from "@/components/auth/AuthLayout";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { getApiUrl } from "@/lib/storage";

/**
 * CLI callback page.
 *
 * Flow:
 * 1. CLI opens browser to API /auth/cli-login, which redirects here
 * 2. This page triggers Clerk sign-in (middleware protects this route)
 * 3. After sign-in, gets a Clerk session token
 * 4. Exchanges it for a long-lived CLI token via POST /auth/cli-token
 * 5. Redirects to CLI's localhost callback with the token
 */
function CliCallbackContent() {
  const { isSignedIn, isLoaded, getToken, userId } = useAuth();
  const { user } = useUser();
  const { signIn } = useSignIn();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Authenticating...");
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const callbackUrl = searchParams.get("callback_url");

  // Build the current URL with query params to return here after sign-in
  const currentPath = typeof window !== "undefined"
    ? `${window.location.pathname}${window.location.search}`
    : "/cli-callback";

  const authenticateWithGoogle = async () => {
    if (!signIn) return;
    try {
      setIsGoogleLoading(true);
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: currentPath,
      });
    } catch (err) {
      console.error("Error during OAuth redirect:", err);
      setError("Authentication failed. Please try again.");
      setIsGoogleLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      // Show sign-in UI (handled in render below)
      return;
    }

    // Wait for user object to load so we can include identity in the redirect
    if (!user) return;

    if (!callbackUrl) {
      setError("Missing callback_url parameter. Please restart the CLI login.");
      return;
    }

    // Validate callback URL is localhost
    try {
      const parsed = new URL(callbackUrl);
      if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
        setError("Invalid callback URL: must be localhost.");
        return;
      }
    } catch {
      setError("Invalid callback URL format.");
      return;
    }

    async function exchangeToken() {
      try {
        setStatus("Getting session token...");

        // Get a Clerk JWT
        const clerkToken = await getToken();
        if (!clerkToken) {
          setError("Failed to get session token. Please try again.");
          return;
        }

        setStatus("Creating CLI token...");

        // Exchange Clerk JWT for a long-lived CLI token
        const apiUrl = getApiUrl();
        const response = await fetch(`${apiUrl}/api/auth/cli-token`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${clerkToken}`,
            "Content-Type": "application/json",
          },
          body: "{}",
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const msg = (errData as { message?: string }).message || `API error ${response.status}`;
          setError(`Failed to create CLI token: ${msg}`);
          return;
        }

        const data = (await response.json()) as {
          token: string;
          userId: string;
          expiresIn: string;
        };

        setStatus("Completing login...");

        // Calculate expiry
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

        // Redirect to CLI callback with token + user info
        const params = new URLSearchParams({
          token: data.token,
          user_id: data.userId,
          expires_at: expiresAt,
        });

        // Include user identity from Clerk
        // fullName may be null if Clerk doesn't have it — fall back to firstName + lastName
        const displayName = user?.fullName
          || [user?.firstName, user?.lastName].filter(Boolean).join(" ")
          || null;
        if (displayName) params.set("full_name", displayName);
        if (user?.primaryEmailAddress?.emailAddress) params.set("email", user.primaryEmailAddress.emailAddress);
        if (user?.imageUrl) params.set("avatar_url", user.imageUrl);

        window.location.href = `${callbackUrl}?${params.toString()}`;
      } catch (err) {
        console.error("CLI token exchange failed:", err);
        setError(
          err instanceof Error
            ? `Login failed: ${err.message}`
            : "An unexpected error occurred."
        );
      }
    }

    void exchangeToken();
  }, [isLoaded, isSignedIn, callbackUrl, getToken, userId, user]);

  if (error) {
    return (
      <AuthLayout>
        <AuthContent>
          <div className="relative shrink-0 w-12 h-12 rounded-xl bg-[rgba(174,96,248,0.8)] flex items-center justify-center text-white font-bold text-lg">
            HQ
          </div>
          <AuthErrorTitle>CLI Login Error</AuthErrorTitle>
          <AuthSubtitle className="max-w-[28rem]">{error}</AuthSubtitle>
          <AuthSubtitle className="max-w-[28rem] text-text-tertiary">
            Return to the terminal and try &quot;hq auth login&quot; again.
          </AuthSubtitle>
        </AuthContent>
      </AuthLayout>
    );
  }

  // Show sign-in UI when not authenticated
  if (isLoaded && !isSignedIn) {
    return (
      <AuthLayout>
        <AuthContent>
          <div className="relative shrink-0 w-12 h-12 rounded-xl bg-[rgba(174,96,248,0.8)] flex items-center justify-center text-white font-bold text-lg">
            HQ
          </div>
          <AuthTitle>Sign in to HQ CLI</AuthTitle>
          <AuthSubtitle>
            Sign in to connect your CLI to HQ Cloud
          </AuthSubtitle>
        </AuthContent>
        <AuthButtonsContainer>
          <GoogleButton
            onClick={() => void authenticateWithGoogle()}
            isLoading={isGoogleLoading}
          />
        </AuthButtonsContainer>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthContent>
        <div className="relative shrink-0 w-12 h-12 rounded-xl bg-[rgba(174,96,248,0.3)] animate-pulse flex items-center justify-center text-white font-bold text-lg">
          HQ
        </div>
        <AuthTitle>CLI Login</AuthTitle>
        <AuthSubtitle>{status}</AuthSubtitle>
      </AuthContent>
    </AuthLayout>
  );
}

// Dynamic import avoids React 19 Suspense type issues with useSearchParams
const CliCallbackDynamic = dynamic(() => Promise.resolve(CliCallbackContent), {
  ssr: false,
  loading: () => (
    <AuthLayout>
      <AuthContent>
        <div className="relative shrink-0 w-12 h-12 rounded-xl bg-[rgba(174,96,248,0.3)] animate-pulse" />
        <AuthSubtitle>Loading...</AuthSubtitle>
      </AuthContent>
    </AuthLayout>
  ),
});

export default function CliCallbackPage() {
  return <CliCallbackDynamic />;
}
