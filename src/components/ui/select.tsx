'use client';

import React, { useRef, useState, useEffect, useId } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

export interface SelectGroup {
  label: string;
  options: SelectOption[];
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options?: SelectOption[];
  groups?: SelectGroup[];
  placeholder?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  searchable?: boolean;
}

export function Select({
  value,
  onChange,
  options,
  groups,
  placeholder = 'Select…',
  label,
  className = '',
  disabled = false,
  size = 'md',
  searchable = false,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  // Flatten all options for lookup
  const allOptions: SelectOption[] = options
    ? options
    : (groups ?? []).flatMap((g) => g.options);

  const selected = allOptions.find((o) => o.value === value);

  // Filter options if searchable
  const filteredOptions = searchable && searchTerm.trim()
    ? (options ? options.filter(o => o.label.toLowerCase().includes(searchTerm.toLowerCase()) || o.value.toLowerCase().includes(searchTerm.toLowerCase())) : undefined)
    : options;

  const filteredGroups = searchable && searchTerm.trim() && groups
    ? groups.map(g => ({
        ...g,
        options: g.options.filter(o => o.label.toLowerCase().includes(searchTerm.toLowerCase()) || o.value.toLowerCase().includes(searchTerm.toLowerCase()))
      })).filter(g => g.options.length > 0)
    : groups;

  // Close on outside click
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
    if (open && searchable) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchTerm('');
    }
  }, [open, searchable]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') setOpen(false);
    if (!searchable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setOpen((o) => !o);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = allOptions.findIndex((o) => o.value === value);
      const next = allOptions[Math.min(idx + 1, allOptions.length - 1)];
      if (next) onChange(next.value);
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = allOptions.findIndex((o) => o.value === value);
      const prev = allOptions[Math.max(idx - 1, 0)];
      if (prev) onChange(prev.value);
    }
  }

  const sizeClass = size === 'sm'
    ? 'px-3 py-1.5 text-xs'
    : 'px-3.5 py-2 text-sm';

  return (
    <div ref={ref} className={`relative ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
        >
          {label}
        </label>
      )}
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onKeyDown={handleKeyDown}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`
          w-full ${sizeClass} flex items-center justify-between gap-2.5
          rounded-xl border border-slate-300 dark:border-slate-700
          bg-white dark:bg-slate-800/90
          text-slate-900 dark:text-white
          shadow-xs hover:border-brand-emerald-500/70 dark:hover:border-brand-emerald-500/70
          hover:bg-slate-50/50 dark:hover:bg-slate-800
          focus:outline-none focus:ring-2 focus:ring-brand-emerald-500/30 focus:border-brand-emerald-500
          transition-all duration-150
          disabled:opacity-50 disabled:cursor-not-allowed
          ${open ? 'border-brand-emerald-500 ring-2 ring-brand-emerald-500/25 shadow-sm' : ''}
        `}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          {selected?.icon && (
            <span className="shrink-0 text-brand-emerald-600 dark:text-brand-emerald-400">
              {selected.icon}
            </span>
          )}
          <span className={`truncate ${!selected ? 'text-slate-400 dark:text-slate-500' : 'font-medium'}`}>
            {selected ? selected.label : placeholder}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180 text-brand-emerald-500' : ''}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-50 mt-1.5 w-full min-w-[200px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-98 duration-100"
          style={{ maxHeight: '300px' }}
        >
          {searchable && (
            <div className="p-2 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs z-10">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search options..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand-emerald-500"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}

          <div className="overflow-y-auto max-h-[240px] p-1 space-y-0.5">
            {/* Flat options */}
            {filteredOptions && filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <OptionItem
                  key={opt.value}
                  option={opt}
                  isSelected={opt.value === value}
                  onSelect={(v) => { onChange(v); setOpen(false); }}
                  size={size}
                />
              ))
            ) : filteredOptions && filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">No matching options</div>
            ) : null}

            {/* Grouped options */}
            {filteredGroups && filteredGroups.length > 0 ? (
              filteredGroups.map((group) => (
                <div key={group.label} className="pt-1">
                  <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
                    {group.label}
                  </div>
                  {group.options.map((opt) => (
                    <OptionItem
                      key={opt.value}
                      option={opt}
                      isSelected={opt.value === value}
                      onSelect={(v) => { onChange(v); setOpen(false); }}
                      size={size}
                    />
                  ))}
                </div>
              ))
            ) : filteredGroups && filteredGroups.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">No matching options</div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function OptionItem({
  option,
  isSelected,
  onSelect,
  size,
}: {
  option: SelectOption;
  isSelected: boolean;
  onSelect: (v: string) => void;
  size: 'sm' | 'md';
}) {
  const py = size === 'sm' ? 'py-1.5' : 'py-2';
  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      onClick={() => onSelect(option.value)}
      className={`
        w-full text-left px-3 ${py} flex items-center gap-2.5
        rounded-lg text-xs md:text-sm transition-colors duration-100
        ${isSelected
          ? 'bg-brand-emerald-500/10 text-brand-emerald-700 dark:text-brand-emerald-300 font-semibold'
          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70'
        }
      `}
    >
      {option.icon && (
        <span className={`shrink-0 ${isSelected ? 'text-brand-emerald-600 dark:text-brand-emerald-400' : 'text-slate-400'}`}>
          {option.icon}
        </span>
      )}
      <span className="flex-1 truncate">
        <span className="block">{option.label}</span>
        {option.description && (
          <span className="block text-[11px] text-slate-400 font-normal leading-tight mt-0.5">{option.description}</span>
        )}
      </span>
      {isSelected && <Check className="h-4 w-4 shrink-0 text-brand-emerald-600 dark:text-brand-emerald-400" />}
    </button>
  );
}
