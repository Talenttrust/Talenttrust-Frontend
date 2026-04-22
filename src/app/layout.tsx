import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TalentTrust - Safe Freelance Payments',
  description: 'Safe, secure payments that protect both freelancers and clients throughout your project.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
