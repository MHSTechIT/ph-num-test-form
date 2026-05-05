import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "My Health School — Invoice Generator",
  description: "Lookup customer invoice records across payment sources.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
