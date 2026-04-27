import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/toast/toast-provider';

export const metadata: Metadata = {
  title: 'TalentTrust',
  description: 'Decentralized Freelancer Escrow Protocol',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
