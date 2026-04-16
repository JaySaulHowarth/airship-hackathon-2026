import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Table Order",
  description: "Hackathon table ordering",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
