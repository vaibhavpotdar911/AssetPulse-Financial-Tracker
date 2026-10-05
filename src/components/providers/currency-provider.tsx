'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED' | 'SGD' | 'CAD' | 'AUD' | 'JPY';

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
  locale: string;
}

export const SUPPORTED_CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  INR: { code: 'INR', symbol: '₹', name: 'Indian Rupee (₹)', locale: 'en-IN' },
  USD: { code: 'USD', symbol: '$', name: 'US Dollar ($)', locale: 'en-US' },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro (€)', locale: 'de-DE' },
  GBP: { code: 'GBP', symbol: '£', name: 'British Pound (£)', locale: 'en-GB' },
  AED: { code: 'AED', symbol: 'AED', name: 'UAE Dirham (AED)', locale: 'en-AE' },
  SGD: { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar (S$)', locale: 'en-SG' },
  CAD: { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar (CA$)', locale: 'en-CA' },
  AUD: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar (A$)', locale: 'en-AU' },
  JPY: { code: 'JPY', symbol: '¥', name: 'Japanese Yen (¥)', locale: 'ja-JP' },
};

interface CurrencyContextType {
  currency: CurrencyCode;
  currencyConfig: CurrencyConfig;
  symbol: string;
  setCurrency: (code: CurrencyCode) => void;
  formatAmount: (amount: number, options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }) => string;
}

const CurrencyContext = createContext<CurrencyContextType>({
  currency: 'INR',
  currencyConfig: SUPPORTED_CURRENCIES.INR,
  symbol: '₹',
  setCurrency: () => {},
  formatAmount: (amount: number) => `₹${amount.toFixed(2)}`,
});

const CURRENCY_STORAGE_KEY = 'assetpulse_currency';

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  // Default currency is INR (Rupees)
  const [currency, setCurrencyState] = useState<CurrencyCode>('INR');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CURRENCY_STORAGE_KEY) as CurrencyCode | null;
      if (stored && SUPPORTED_CURRENCIES[stored]) {
        setCurrencyState(stored);
      }
    } catch {
      // localStorage not accessible
    }
  }, []);

  const setCurrency = (code: CurrencyCode) => {
    if (SUPPORTED_CURRENCIES[code]) {
      setCurrencyState(code);
      try {
        localStorage.setItem(CURRENCY_STORAGE_KEY, code);
      } catch {
        // localStorage write error
      }
    }
  };

  const currencyConfig = SUPPORTED_CURRENCIES[currency] || SUPPORTED_CURRENCIES.INR;

  /**
   * Deterministic currency formatter:
   * Uses standard symbol + locale-formatted number.
   * Avoids ICU whitespace differences between Node.js server (e.g. "₹0.00")
   * and browser webkit/blink (e.g. "₹ 0.00" with non-breaking space).
   */
  const formatAmount = (
    amount: number,
    options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
  ) => {
    const minDigits = options?.minimumFractionDigits ?? 2;
    const maxDigits = options?.maximumFractionDigits ?? 2;
    const num = Number(amount || 0);

    try {
      const formattedNum = num.toLocaleString(currencyConfig.locale, {
        minimumFractionDigits: minDigits,
        maximumFractionDigits: maxDigits,
      });
      return `${currencyConfig.symbol}${formattedNum}`;
    } catch {
      return `${currencyConfig.symbol}${num.toFixed(minDigits)}`;
    }
  };

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        currencyConfig,
        symbol: currencyConfig.symbol,
        setCurrency,
        formatAmount,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  return useContext(CurrencyContext);
}
