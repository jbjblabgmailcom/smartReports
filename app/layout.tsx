import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Raporty",
  description: "CMM report and balloon matcher"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
