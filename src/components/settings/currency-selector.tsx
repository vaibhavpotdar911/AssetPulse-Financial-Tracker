'use client';

import React from 'react';
import { useCurrency, SUPPORTED_CURRENCIES, CurrencyCode } from '@/components/providers/currency-provider';
import { Select } from '@/components/ui/select';
import { Coins } from 'lucide-react';

interface CurrencySelectorProps {
  className?: string;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

export function CurrencySelector({ className = '', size = 'md', showLabel = true }: CurrencySelectorProps) {
  const { currency, setCurrency } = useCurrency();

  const options = Object.values(SUPPORTED_CURRENCIES).map((c) => ({
    value: c.code,
    label: `${c.name}`,
    icon: <span className="font-bold text-xs font-mono">{c.symbol}</span>,
    description: `Currency Code: ${c.code}`,
  }));

  return (
    <div className={className}>
      <Select
        value={currency}
        onChange={(val) => setCurrency(val as CurrencyCode)}
        options={options}
        label={showLabel ? 'Display Currency' : undefined}
        size={size}
        placeholder="Select Currency"
      />
    </div>
  );
}
