import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "HQ Cloud",
  description: "Personal OS for AI Workers",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HQ Cloud",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0D0D0F",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider appearance={{ baseTheme: dark }}>
      <html lang="en">
        <body className="bg-bg-primary text-text-primary min-h-dvh">
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
