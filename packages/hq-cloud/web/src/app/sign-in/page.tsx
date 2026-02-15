"use client";

import { useSignIn, useSignUp, useAuth } from '@clerk/nextjs';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  AuthLayout,
  AuthContent,
  AuthTitle,
  AuthErrorTitle,
  AuthSubtitle,
  AuthButtonsContainer,
} from '@/components/auth/AuthLayout';
import { GoogleButton } from '@/components/auth/GoogleButton';

export default function SignInPage() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();

  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if already signed in
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace('/agents');
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !signIn || !signUp) {
    return (
      <AuthLayout>
        <AuthContent>
          <div className="relative shrink-0 w-12 h-12 rounded-xl bg-[rgba(174,96,248,0.3)] animate-pulse" />
          <AuthSubtitle>Loading...</AuthSubtitle>
        </AuthContent>
      </AuthLayout>
    );
  }

  if (isSignedIn) return null;

  const authenticateWithGoogle = async () => {
    try {
      setIsGoogleLoading(true);
      setError(null);

      await signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/agents',
      });
    } catch (err) {
      console.error('Error during OAuth redirect:', err);
      setError('Authentication failed. Please try again.');
      setIsGoogleLoading(false);
    }
  };

  if (error) {
    return (
      <AuthLayout>
        <AuthContent>
          <div className="relative shrink-0 w-12 h-12 rounded-xl bg-[rgba(174,96,248,0.8)] flex items-center justify-center text-white font-bold text-lg">
            HQ
          </div>
          <AuthErrorTitle>Authentication Error</AuthErrorTitle>
          <AuthSubtitle className="max-w-[28rem]">{error}</AuthSubtitle>
        </AuthContent>
        <AuthButtonsContainer>
          <GoogleButton
            onClick={() => {
              setError(null);
              void authenticateWithGoogle();
            }}
            label="Try Again"
          />
        </AuthButtonsContainer>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthContent>
        <div className="relative shrink-0 w-12 h-12 rounded-xl bg-[rgba(174,96,248,0.8)] flex items-center justify-center text-white font-bold text-lg">
          HQ
        </div>
        <AuthTitle>Sign in to HQ Cloud</AuthTitle>
        <AuthSubtitle>
          Sign in to manage your AI workers
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
