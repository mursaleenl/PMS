import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";
import "./styles/features.css";
import "./styles/workspace.css";
import "./styles/floating-navigation.css";
import "./styles/premium-workspace.css";
import "./styles/mobile-polish.css";
import { WorkspaceShell } from "./_components/workspace-shell";
import { AppProviders } from "./_components/providers";

const roboto = Roboto({ subsets: ["latin"], variable: "--font-roboto", weight: "variable", style: ["normal", "italic"], display: "swap" });

export const metadata: Metadata = {
  title: "EVECTURE · Project Workspace",
  description: "EVECTURE project management workspace",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={roboto.variable}>
      <body className={`${roboto.variable} ${roboto.className}`}>
        <AppProviders>
          <WorkspaceShell>{children}</WorkspaceShell>
        </AppProviders>
      </body>
    </html>
  );
}

