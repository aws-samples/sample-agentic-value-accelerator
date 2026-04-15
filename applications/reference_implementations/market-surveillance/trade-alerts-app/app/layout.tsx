import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import { AmplifyProvider } from "@/lib/auth/AmplifyProvider";
import { DomainProvider } from "@/lib/context/DomainContext";

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
          <DomainProvider>
            <Header />
            <main className="min-h-screen">
              {children}
            </main>
          </DomainProvider>
        </AmplifyProvider>
      </body>
    </html>
  );
}
