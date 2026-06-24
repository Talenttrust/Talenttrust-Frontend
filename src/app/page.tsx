'use client';

import { useState } from 'react';
import { ToastDemo } from '@/components/toast/toast-demo';
import { FormField } from '@/components/FormField';
import { ErrorSummary } from '@/components/ErrorSummary';
import { useToast } from '@/components/toast/toast-provider';
import { validateLogin } from '@/lib/validateLogin';

export default function Home() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ fieldId: string; message: string }[]>([]);
  const { showSuccess } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors = validateLogin(email, password);
    setErrors(newErrors);

    if (newErrors.length === 0) {
      showSuccess({
        title: 'Form submitted successfully!',
      });
    }
  };

  const getError = (fieldId: string) => errors.find((e) => e.fieldId === fieldId)?.message;

  return (
    // NOTE: No <main> landmark here - the root layout (src/app/layout.tsx) already provides
    // the single <main id="main-content"> landmark. Per WCAG, a page should have exactly one
    // main landmark to avoid confusing screen reader users with duplicate navigation targets.
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eff6ff_100%)] px-6 py-20">
      <div className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-3xl flex-col items-center justify-center rounded-[2rem] border border-white/70 bg-white/80 p-10 text-center shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
        <h2 className="mb-4 text-3xl font-bold text-center text-slate-900 sm:text-5xl">
          TalentTrust
        </h2>

        <p className="max-w-xl text-center text-base text-slate-600 sm:text-lg">
          Decentralized Freelancer Escrow Protocol on Stellar
        </p>
        <p className="mt-4 max-w-lg text-center text-sm text-slate-500 sm:text-base">
          Accessible toast feedback now supports transient success and error states, including screen reader announcements for critical wallet and payout events.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 w-full max-w-md text-left" noValidate>
          <ErrorSummary errors={errors} />

          <div className="space-y-4">
            <FormField
              label="Email"
              id="email"
              error={getError('email')}
              required
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
                placeholder="you@example.com"
              />
            </FormField>

            <FormField
              label="Password"
              id="password"
              error={getError('password')}
              required
            >
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
                placeholder="••••••••"
              />
            </FormField>
          </div>

          <button
            type="submit"
            className="mt-6 w-full rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 shadow-md"
          >
            Sign In
          </button>
        </form>

        <ToastDemo />
      </div>
    </div>
  );
}

