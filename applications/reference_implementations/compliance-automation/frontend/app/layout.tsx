import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Compliance Automation',
  description: 'FSI Regulatory Compliance Monitoring & Report Review',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <h1 className="text-xl font-semibold">Compliance Automation</h1>
            <nav className="flex gap-6 text-sm">
              <a href="/" className="hover:text-blue-600">Deadlines</a>
              <a href="/review" className="hover:text-blue-600">Report Review</a>
            </nav>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
