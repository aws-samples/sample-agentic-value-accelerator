import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import { AmplifyProvider } from "@/lib/auth/AmplifyProvider";

export const metadata: Metadata = {
  title: "Market Surveillance Portal",
  description: "Market Surveillance Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-gray-50">
        <AmplifyProvider>
          <Header />
          <main className="min-h-screen">
            {children}
          </main>
        </AmplifyProvider>
      </body>
    </html>
  );
}
