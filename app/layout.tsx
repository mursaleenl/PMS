import type { Metadata } from "next";
import { DM_Sans, Manrope } from "next/font/google";
import "./globals.css";
import { WorkspaceShell } from "./_components/workspace-shell";
import { AppProviders } from "./_components/providers";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });

export const metadata: Metadata = {
  title: "Evecture Studio · Project Workspace",
  description: "Evecture Studio project management workspace",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${manrope.variable}`}><AppProviders><WorkspaceShell>{children}</WorkspaceShell></AppProviders></body>
    </html>
  );
}
