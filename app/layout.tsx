import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Naskah AI | Project Planner",
  description: "Ubah ide menjadi PRD, arsitektur, desain, API, database, dan rencana implementasi dalam Markdown.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased">{children}</body>
    </html>
  );
}
