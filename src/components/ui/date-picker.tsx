'use client';

import React, { useState, useRef, useEffect, useId } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';

export interface DatePickerProps {
  value: string; // ISO date string YYYY-MM-DD
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  min?: string;
  max?: string;
  placeholder?: string;
  className?: string;
  size?: 'sm' | 'md';
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const SHORT_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function parseYMD(str: string): { year: number; month: number; day: number } | null {
  if (!str) return null;
  const parts = str.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1; // 0-indexed
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return { year: y, month: m, day: d };
}

function formatDisplayDate(dateStr: string): string {
  const parsed = parseYMD(dateStr);
  if (!parsed) return '';
  return `${SHORT_MONTH_NAMES[parsed.month]} ${String(parsed.day).padStart(2, '0')}, ${parsed.year}`;
}

function getTodayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function DatePicker({
  value,
  onChange,
  label,
  required = false,
  min,
  max,
  placeholder = 'Select date...',
  className = '',
  size = 'md',
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const parsedValue = parseYMD(value);
  const now = new Date();
  const initialYear = parsedValue ? parsedValue.year : now.getFullYear();
  const initialMonth = parsedValue ? parsedValue.month : now.getMonth();

  const [viewYear, setViewYear] = useState<number>(initialYear);
  const [viewMonth, setViewMonth] = useState<number>(initialMonth);

  // Update view month/year if value changes externally
  useEffect(() => {
    if (value) {
      const p = parseYMD(value);
      if (p) {
        setViewYear(p.year);
        setViewMonth(p.month);
      }
    }
  }, [value]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  // Calendar calculations
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectDate = (day: number) => {
    const monthStr = String(viewMonth + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateStr = `${viewYear}-${monthStr}-${dayStr}`;
    onChange(dateStr);
    setOpen(false);
  };

  const handleQuickSelectToday = () => {
    const todayStr = getTodayString();
    onChange(todayStr);
    const nowD = new Date();
    setViewYear(nowD.getFullYear());
    setViewMonth(nowD.getMonth());
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  // Generate day matrix
  const days: { day: number; currentMonth: boolean; dateStr: string; disabled: boolean }[] = [];

  // Previous month trailing days
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = viewMonth === 0 ? 12 : viewMonth;
    const y = viewMonth === 0 ? viewYear - 1 : viewYear;
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ day: d, currentMonth: false, dateStr, disabled: true });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    let disabled = false;
    if (min && dateStr < min) disabled = true;
    if (max && dateStr > max) disabled = true;
    days.push({ day: d, currentMonth: true, dateStr, disabled });
  }

  // Next month leading days (fill row to complete grid)
  const remainingCells = (7 - (days.length % 7)) % 7;
  for (let d = 1; d <= remainingCells; d++) {
    const m = viewMonth === 11 ? 1 : viewMonth + 2;
    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ day: d, currentMonth: false, dateStr, disabled: true });
  }

  const displayValue = formatDisplayDate(value);
  const todayStr = getTodayString();
  const heightClass = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm';

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label htmlFor={id} className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      {/* Trigger Button */}
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`
          w-full ${heightClass} flex items-center justify-between gap-2.5
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
          <CalendarIcon className="h-4 w-4 shrink-0 text-brand-emerald-600 dark:text-brand-emerald-400" />
          <span className={`truncate ${!displayValue ? 'text-slate-400 dark:text-slate-500' : 'font-medium'}`}>
            {displayValue || placeholder}
          </span>
        </span>
        <div className="flex items-center gap-1">
          {displayValue && !required && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </div>
      </button>

      {/* Calendar Popover */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="absolute z-50 mt-1.5 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-3.5 animate-in fade-in-0 zoom-in-95 duration-150"
        >
          {/* Header Month/Year Selector & Nav */}
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-1.5 font-bold text-sm text-slate-900 dark:text-white">
              <span>{MONTH_NAMES[viewMonth]}</span>
              <span className="text-brand-emerald-600 dark:text-brand-emerald-400 font-extrabold">{viewYear}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                aria-label="Previous Month"
                className="p-1 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                aria-label="Next Month"
                className="p-1 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {DAYS_OF_WEEK.map((d) => (
              <span
                key={d}
                className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider py-1"
              >
                {d}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {days.map((item, index) => {
              if (!item.currentMonth) {
                return (
                  <span
                    key={index}
                    className="h-8 flex items-center justify-center text-xs text-slate-300 dark:text-slate-600 pointer-events-none"
                  >
                    {item.day}
                  </span>
                );
              }

              const isSelected = value === item.dateStr;
              const isCurrentDay = item.dateStr === todayStr;

              return (
                <button
                  key={index}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => handleSelectDate(item.day)}
                  className={`
                    h-8 w-8 mx-auto flex items-center justify-center rounded-xl text-xs font-medium transition-all duration-100
                    ${item.disabled ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed opacity-40' : ''}
                    ${
                      isSelected
                        ? 'bg-brand-emerald-600 text-white font-bold shadow-md shadow-brand-emerald-600/30 ring-2 ring-brand-emerald-500/50'
                        : isCurrentDay
                        ? 'border border-brand-emerald-500 text-brand-emerald-600 dark:text-brand-emerald-400 font-semibold hover:bg-brand-emerald-50 dark:hover:bg-brand-950/30'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }
                  `}
                >
                  {item.day}
                </button>
              );
            })}
          </div>

          {/* Footer Quick Action: Today & Clear */}
          <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={handleQuickSelectToday}
              className="text-brand-emerald-600 dark:text-brand-emerald-400 font-semibold hover:underline"
            >
              Today
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
