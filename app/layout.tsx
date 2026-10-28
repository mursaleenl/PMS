import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WorkspaceShell } from "./_components/workspace-shell";
import { AppProviders } from "./_components/providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "EVECTURE · Project Workspace",
  description: "EVECTURE project management workspace",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.variable} ${inter.className}`}>
        <AppProviders>
          <WorkspaceShell>{children}</WorkspaceShell>
        </AppProviders>
      </body>
    </html>
  );
}

