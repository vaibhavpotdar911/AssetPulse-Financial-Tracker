'use client';

import React, { useRef, useState, useEffect, useId } from 'react';
import { ChevronDown, Check, Building2, Plus, Search } from 'lucide-react';

export interface InstitutionOption {
  value: string;
  label: string;
  category?: string;
  badge?: string;
}

export const PRESET_INSTITUTIONS: InstitutionOption[] = [
  // Major Indian Banks (Public & Private)
  { value: 'State Bank of India (SBI)', label: 'State Bank of India (SBI)', category: 'Public Sector Banks', badge: 'PSU' },
  { value: 'HDFC Bank', label: 'HDFC Bank', category: 'Private Sector Banks', badge: 'Private' },
  { value: 'ICICI Bank', label: 'ICICI Bank', category: 'Private Sector Banks', badge: 'Private' },
  { value: 'Punjab National Bank (PNB)', label: 'Punjab National Bank (PNB)', category: 'Public Sector Banks', badge: 'PSU' },
  { value: 'Bank of Baroda', label: 'Bank of Baroda', category: 'Public Sector Banks', badge: 'PSU' },
  { value: 'Axis Bank', label: 'Axis Bank', category: 'Private Sector Banks', badge: 'Private' },
  { value: 'Kotak Mahindra Bank', label: 'Kotak Mahindra Bank', category: 'Private Sector Banks', badge: 'Private' },
  { value: 'Canara Bank', label: 'Canara Bank', category: 'Public Sector Banks', badge: 'PSU' },
  { value: 'Union Bank of India', label: 'Union Bank of India', category: 'Public Sector Banks', badge: 'PSU' },
  { value: 'IndusInd Bank', label: 'IndusInd Bank', category: 'Private Sector Banks', badge: 'Private' },
  { value: 'IDFC FIRST Bank', label: 'IDFC FIRST Bank', category: 'Private Sector Banks', badge: 'Private' },
  { value: 'Federal Bank', label: 'Federal Bank', category: 'Private Sector Banks', badge: 'Private' },
  { value: 'Yes Bank', label: 'Yes Bank', category: 'Private Sector Banks', badge: 'Private' },

  // Small Finance Banks (Known for high FD interest rates)
  { value: 'AU Small Finance Bank', label: 'AU Small Finance Bank', category: 'Small Finance Banks (High Yield)', badge: 'SFB' },
  { value: 'Equitas Small Finance Bank', label: 'Equitas Small Finance Bank', category: 'Small Finance Banks (High Yield)', badge: 'SFB' },
  { value: 'Ujjivan Small Finance Bank', label: 'Ujjivan Small Finance Bank', category: 'Small Finance Banks (High Yield)', badge: 'SFB' },
  { value: 'Suryoday Small Finance Bank', label: 'Suryoday Small Finance Bank', category: 'Small Finance Banks (High Yield)', badge: 'SFB' },
  { value: 'Jana Small Finance Bank', label: 'Jana Small Finance Bank', category: 'Small Finance Banks (High Yield)', badge: 'SFB' },

  // NBFCs & Corporate Deposits
  { value: 'Bajaj Finance', label: 'Bajaj Finance', category: 'NBFCs & Corporate FDs', badge: 'NBFC' },
  { value: 'Shriram Finance', label: 'Shriram Finance', category: 'NBFCs & Corporate FDs', badge: 'NBFC' },
  { value: 'Mahindra Finance', label: 'Mahindra Finance', category: 'NBFCs & Corporate FDs', badge: 'NBFC' },
  { value: 'Post Office Time Deposit', label: 'India Post Office TD', category: 'Government / Post Office', badge: 'Govt' },

  // International / Global Banks
  { value: 'JPMorgan Chase', label: 'JPMorgan Chase', category: 'International Banks', badge: 'Global' },
  { value: 'Bank of America', label: 'Bank of America', category: 'International Banks', badge: 'Global' },
  { value: 'Citibank', label: 'Citibank', category: 'International Banks', badge: 'Global' },
  { value: 'HSBC', label: 'HSBC', category: 'International Banks', badge: 'Global' },
  { value: 'Standard Chartered', label: 'Standard Chartered', category: 'International Banks', badge: 'Global' },
  { value: 'Barclays', label: 'Barclays', category: 'International Banks', badge: 'Global' },
  { value: 'Wells Fargo', label: 'Wells Fargo', category: 'International Banks', badge: 'Global' },
];

interface InstitutionSelectProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  className?: string;
}

export function InstitutionSelect({
  value,
  onChange,
  label = 'Bank / Financial Institution',
  required = false,
  className = '',
}: InstitutionSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customName, setCustomName] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  // If initial value is not in presets and non-empty, keep it
  const isPreset = PRESET_INSTITUTIONS.some((inst) => inst.value === value);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 60);
    } else {
      setSearch('');
    }
  }, [open]);

  const filtered = PRESET_INSTITUTIONS.filter((inst) =>
    inst.label.toLowerCase().includes(search.toLowerCase()) ||
    (inst.category && inst.category.toLowerCase().includes(search.toLowerCase()))
  );

  // Group by category
  const categories: { [cat: string]: InstitutionOption[] } = {};
  filtered.forEach((inst) => {
    const cat = inst.category || 'Other Institutions';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(inst);
  });

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
    setIsCustomMode(false);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customName.trim()) {
      onChange(customName.trim());
      setIsCustomMode(false);
      setCustomName('');
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      {isCustomMode ? (
        <div className="flex gap-2">
          <input
            type="text"
            required={required}
            autoFocus
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Type your institution name..."
            className="flex-1 px-3 py-2 text-sm rounded-xl border border-brand-emerald-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-emerald-500/30"
          />
          <button
            type="button"
            onClick={handleCustomSubmit}
            disabled={!customName.trim()}
            className="px-3 py-2 text-xs font-semibold text-white bg-brand-emerald-600 hover:bg-brand-emerald-700 rounded-xl disabled:opacity-50 transition-colors"
          >
            Done
          </button>
          <button
            type="button"
            onClick={() => setIsCustomMode(false)}
            className="px-2.5 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          id={id}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`
            w-full px-3.5 py-2 text-sm flex items-center justify-between gap-2.5
            rounded-xl border border-slate-300 dark:border-slate-700
            bg-white dark:bg-slate-800/90
            text-slate-900 dark:text-white shadow-xs
            hover:border-brand-emerald-500/70 dark:hover:border-brand-emerald-500/70
            focus:outline-none focus:ring-2 focus:ring-brand-emerald-500/30 focus:border-brand-emerald-500
            transition-all duration-150
            ${open ? 'border-brand-emerald-500 ring-2 ring-brand-emerald-500/25 shadow-sm' : ''}
          `}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <Building2 className="h-4 w-4 shrink-0 text-brand-emerald-600 dark:text-brand-emerald-400" />
            <span className={`truncate ${!value ? 'text-slate-400 dark:text-slate-500' : 'font-medium'}`}>
              {value || 'Select bank / financial institution…'}
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180 text-brand-emerald-500' : ''}`}
          />
        </button>
      )}

      {open && !isCustomMode && (
        <div
          role="listbox"
          className="absolute z-50 mt-1.5 w-full min-w-[280px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-98 duration-100"
          style={{ maxHeight: '340px' }}
        >
          {/* Search box & Custom Add option */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs z-10 space-y-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search bank (e.g. SBI, HDFC, Chase)..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand-emerald-500"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setCustomName(search);
                setIsCustomMode(true);
                setOpen(false);
              }}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-semibold text-brand-emerald-700 dark:text-brand-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-colors border border-emerald-500/20"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Enter custom bank name</span>
            </button>
          </div>

          <div className="overflow-y-auto max-h-[250px] p-1 space-y-1">
            {Object.keys(categories).length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-xs text-slate-500 mb-2">No banks found matching &quot;{search}&quot;</p>
                <button
                  type="button"
                  onClick={() => {
                    onChange(search);
                    setOpen(false);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-brand-emerald-600 rounded-lg"
                >
                  Use &quot;{search}&quot;
                </button>
              </div>
            ) : (
              Object.entries(categories).map(([cat, items]) => (
                <div key={cat} className="pt-1 first:pt-0">
                  <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
                    {cat}
                  </div>
                  {items.map((item) => {
                    const isSelected = value === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelect(item.value)}
                        className={`
                          w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2
                          text-xs md:text-sm transition-colors duration-100
                          ${isSelected
                            ? 'bg-brand-emerald-500/10 text-brand-emerald-700 dark:text-brand-emerald-300 font-semibold'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                          }
                        `}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="truncate">{item.label}</span>
                          {item.badge && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                              {item.badge}
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-brand-emerald-600 dark:text-brand-emerald-400" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
