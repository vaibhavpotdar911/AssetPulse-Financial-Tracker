'use client';

import React from 'react';
import Link from 'next/link';
import { Logo } from './logo';
import { ThemeToggle } from './theme-toggle';
import { Landmark, Shield, Bell, ArrowRight } from 'lucide-react';

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full brand-glass border-b border-slate-200/80 dark:border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Logo size="md" />

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 hover:text-brand-emerald-600 dark:hover:text-brand-emerald-400 transition-colors"
          >
            <Landmark className="h-4 w-4" />
            <span>Dashboard</span>
          </Link>
          <Link
            href="/deposits"
            className="flex items-center gap-1.5 hover:text-brand-emerald-600 dark:hover:text-brand-emerald-400 transition-colors"
          >
            <Shield className="h-4 w-4" />
            <span>Fixed Deposits</span>
          </Link>
          <Link
            href="/audit-logs"
            className="flex items-center gap-1.5 hover:text-brand-emerald-600 dark:hover:text-brand-emerald-400 transition-colors"
          >
            <Bell className="h-4 w-4" />
            <span>Audit Ledger</span>
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link
            href="/login"
            className="hidden sm:inline-flex text-sm font-semibold text-slate-700 dark:text-slate-200 hover:text-brand-emerald-600 dark:hover:text-brand-emerald-400 px-3 py-2 transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-brand-emerald-600 hover:bg-brand-emerald-700 dark:bg-brand-emerald-600 dark:hover:bg-brand-emerald-500 rounded-lg shadow-sm transition-all focus:ring-2 focus:ring-brand-emerald-500 focus:outline-none"
          >
            <span>Get Started</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
