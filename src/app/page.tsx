'use client';

import { useState } from 'react';
import { FormField } from '@/components/FormField';
import { ErrorSummary } from '@/components/ErrorSummary';

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
    <main className="min-h-screen p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">TalentTrust</h1>
      
      <section className="bg-white p-6 rounded-lg shadow-sm border">
        <h2 className="text-xl font-semibold mb-6">Demo: Standardized Form Validation</h2>
        
        <ErrorSummary errors={errors} />

        <form onSubmit={handleSubmit} noValidate>
          <FormField
            label="Email Address"
            id="email"
            error={getError('email')}
            helperText="We'll never share your email with anyone else."
            required
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              placeholder="name@example.com"
            />
          </FormField>

          <FormField
            label="Password"
            id="password"
            error={getError('password')}
            helperText="Minimum 8 characters."
            required
          >
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
              placeholder="••••••••"
            />
          </FormField>

          <button
            type="submit"
            className="w-full mt-4 bg-blue-600 text-white font-medium py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          >
            Sign Up
          </button>
        </form>
      </section>
    </main>
  );
}
