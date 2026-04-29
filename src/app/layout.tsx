import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/toast/toast-provider';

export const metadata: Metadata = {
  title: 'TalentTrust - Safe Freelance Payments',
  description: 'Safe, secure payments that protect both freelancers and clients throughout your project.',
};

import { PreferencesProvider } from '@/lib/preferences';
import { SettingsTrigger } from '@/components/settings/SettingsTrigger';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <PreferencesProvider>
          <ToastProvider>
            {children}
            <SettingsTrigger />
          </ToastProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
