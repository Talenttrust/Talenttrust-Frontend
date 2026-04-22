import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TalentTrust - Secure Freelance Payments',
  description: 'Secure payments for freelancers and clients using blockchain technology.',
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
