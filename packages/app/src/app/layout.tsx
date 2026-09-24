import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "DevMentor",
  description: "Connect developers with mentors.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      {/* Browser writing assistants such as Grammarly add attributes directly to body before
          React starts. Ignore that one host-node difference; descendant hydration warnings
          remain enabled, so application mismatches are not hidden. */}
      <body suppressHydrationWarning className="min-h-full bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
