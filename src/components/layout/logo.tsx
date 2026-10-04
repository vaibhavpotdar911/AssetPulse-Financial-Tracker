import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  href?: string;
  className?: string;
}

export function Logo({
  size = 'md',
  showText = true,
  href = '/',
  className = '',
}: LogoProps) {
  const sizeMap = {
    sm: { img: 28, text: 'text-lg', badge: 'h-7 w-7' },
    md: { img: 36, text: 'text-xl', badge: 'h-9 w-9' },
    lg: { img: 48, text: 'text-2xl', badge: 'h-12 w-12' },
  };

  const current = sizeMap[size];

  const content = (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      <div className={`relative overflow-hidden rounded-xl border border-emerald-500/20 shadow-sm shadow-emerald-500/10 ${current.badge}`}>
        <Image
          src="/logo.jpg"
          alt="AssetPulse Logo"
          width={current.img}
          height={current.img}
          priority
          className="object-cover w-full h-full"
        />
      </div>
      {showText && (
        <span className={`font-bold tracking-tight text-slate-900 dark:text-white ${current.text}`}>
          Asset<span className="text-brand-emerald-600 dark:text-brand-emerald-400">Pulse</span>
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex items-center hover:opacity-90 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}
