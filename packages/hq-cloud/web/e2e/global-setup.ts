import { clerkSetup } from "@clerk/testing/playwright";
import { FullConfig } from "@playwright/test";

/**
 * Playwright global setup.
 *
 * Calls clerkSetup() from @clerk/testing to obtain a testing token
 * from the Clerk dev instance. This enables clerk.signIn() in test
 * fixtures to bypass the OAuth flow and authenticate directly.
 *
 * Requires NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (from .env.local or env).
 */
export default async function globalSetup(config: FullConfig) {
  // clerkSetup reads publishable key from NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  // and creates a __clerk_testing_token cookie for the test browser
  await clerkSetup({
    frontendApiUrl:
      config.projects[0]?.use?.baseURL ?? "http://localhost:3000",
  });
}
