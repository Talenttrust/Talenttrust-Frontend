'use client';

import { useState } from 'react';
import { ToastDemo } from '@/components/toast/toast-demo';

export default function Home() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ fieldId: string; message: string }[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors = [];

    if (!email) {
      newErrors.push({ fieldId: 'email', message: 'Email is required' });
    } else if (!email.includes('@')) {
      newErrors.push({ fieldId: 'email', message: 'Email must be valid' });
    }

    if (!password) {
      newErrors.push({ fieldId: 'password', message: 'Password is required' });
    } else if (password.length < 8) {
      newErrors.push({ fieldId: 'password', message: 'Password must be at least 8 characters' });
    }

    setErrors(newErrors);

    if (newErrors.length === 0) {
      alert('Form submitted successfully!');
    }
  };

  const getError = (fieldId: string) => errors.find((e) => e.fieldId === fieldId)?.message;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eff6ff_100%)] px-6 py-20">
      <div className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-3xl flex-col items-center justify-center rounded-[2rem] border border-white/70 bg-white/80 p-10 text-center shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
        <h1 className="mb-4 text-3xl font-bold text-center text-slate-900 sm:text-5xl">
          TalentTrust
        </h1>
        <p className="max-w-xl text-center text-base text-slate-600 sm:text-lg">
          Decentralized Freelancer Escrow Protocol on Stellar
        </p>
        <p className="mt-4 max-w-lg text-center text-sm text-slate-500 sm:text-base">
          Accessible toast feedback now supports transient success and error states, including screen reader announcements for critical wallet and payout events.
        </p>
        <ToastDemo />
      </div>
    </main>
  );
}
