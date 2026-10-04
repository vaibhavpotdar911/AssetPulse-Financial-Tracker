'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Logo } from '@/components/layout/logo';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Loader2,
  Sparkles,
} from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || 'Invalid email or password.');
        setLoading(false);
        return;
      }

      // Successful login -> Navigate to destination
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError('Unable to connect to the authentication server. Please try again.');
      setLoading(false);
    }
  };

  const handleFillDemo = () => {
    setEmail('demo@assetpulse.dev');
    setPassword('Password123!');
    setError('');
  };

  return (
    <div className="brand-glass rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-6 sm:p-8 shadow-xl shadow-slate-200/40 dark:shadow-none">
      {/* Brand Header */}
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <Logo size="lg" href="/" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Welcome back
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          Sign in to your account to manage your fixed deposits portfolio
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          className="mt-5 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
          <span className="leading-snug">{error}</span>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5"
          >
            Email Address
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 dark:text-slate-500">
              <Mail className="h-4 w-4" />
            </div>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 pl-10 pr-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-brand-emerald-500 focus:outline-none focus:ring-2 focus:ring-brand-emerald-500/20 transition-all"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="password"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300"
            >
              Password
            </label>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 dark:text-slate-500">
              <Lock className="h-4 w-4" />
            </div>
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 pl-10 pr-10 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-brand-emerald-500 focus:outline-none focus:ring-2 focus:ring-brand-emerald-500/20 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 flex items-center justify-center gap-2 rounded-lg bg-brand-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-emerald-700 dark:bg-brand-emerald-600 dark:hover:bg-brand-emerald-500 focus:outline-none focus:ring-2 focus:ring-brand-emerald-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <span>Sign In</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </form>

      {/* Demo Credentials Helper */}
      <div className="mt-5 pt-4 border-t border-slate-200/80 dark:border-slate-800/80">
        <button
          type="button"
          onClick={handleFillDemo}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100/70 hover:bg-slate-200/70 dark:bg-slate-800/60 dark:hover:bg-slate-800 transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5 text-brand-emerald-600 dark:text-brand-emerald-400" />
          <span>Quick Fill Demo Credentials</span>
        </button>
      </div>

      {/* Footer Link to Register */}
      <div className="mt-5 text-center text-sm text-slate-600 dark:text-slate-400">
        Don&apos;t have an account?{' '}
        <Link
          href="/register"
          className="font-semibold text-brand-emerald-600 hover:text-brand-emerald-500 dark:text-brand-emerald-400 transition-colors"
        >
          Create one now
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="brand-glass rounded-2xl p-8 flex items-center justify-center text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin text-brand-emerald-600" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
