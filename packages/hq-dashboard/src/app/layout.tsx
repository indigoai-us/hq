import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HQ Dashboard",
  description: "Project dashboard for HQ",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-bg-primary text-text-primary min-h-dvh">
        {children}
      </body>
    </html>
  );
}
