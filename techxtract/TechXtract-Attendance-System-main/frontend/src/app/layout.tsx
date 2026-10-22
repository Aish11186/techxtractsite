import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';

export const metadata: Metadata = {
  title: 'TechX Attendance — Society Event & Attendance Management System',
  description: 'Authoritative College Technical Society Event & Attendance Management System with Barcode / QR Scanning, Atomic DB Duplication Protection, and SHA-256 Hash Chained Audit Immutability.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full bg-neutral-950 text-neutral-100 flex flex-col font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
