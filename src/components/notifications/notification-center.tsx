'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Check,
  CheckCheck,
  RotateCcw,
  ExternalLink,
  Calendar,
  AlertTriangle,
  Info,
  Clock,
  ShieldAlert,
  Loader2,
  X,
} from 'lucide-react';

export interface NotificationItem {
  id: string;
  userId: string;
  depositId: string | null;
  type: 'MATURED_TODAY' | 'MATURING_7_DAYS' | 'MATURING_14_DAYS' | 'MATURING_30_DAYS' | 'SYSTEM' | string;
  severity: 'critical' | 'warning' | 'info' | string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
  deposit?: {
    id: string;
    bankName: string;
    accountNumber: string;
    principalAmount: number;
    maturityAmount: number;
    maturityDate: string;
    status: string;
  } | null;
}

/**
 * Formats ISO date into human-readable relative time string.
 */
function formatTimeAgo(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return 'Recently';
  }
}

/**
 * Returns color-coded badge metadata based on maturity threshold.
 */
function getThresholdBadge(type: string, severity: string) {
  switch (type) {
    case 'MATURED_TODAY':
      return {
        label: 'Matured Today',
        badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30',
        icon: AlertTriangle,
      };
    case 'MATURING_7_DAYS':
      return {
        label: '7 Days Left',
        badgeClass: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30',
        icon: Clock,
      };
    case 'MATURING_14_DAYS':
      return {
        label: '14 Days Left',
        badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30',
        icon: Calendar,
      };
    case 'MATURING_30_DAYS':
      return {
        label: '30 Days Left',
        badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30',
        icon: Info,
      };
    default:
      if (severity === 'critical') {
        return {
          label: 'Critical',
          badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30',
          icon: ShieldAlert,
        };
      }
      return {
        label: 'Update',
        badgeClass: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/30',
        icon: Info,
      };
  }
}

export function NotificationCenter() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch notifications list
  const fetchNotifications = useCallback(async (showSpinner = false) => {
    try {
      if (showSpinner) setLoading(true);
      const res = await fetch(`/api/notifications?limit=25`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(typeof data.unreadCount === 'number' ? data.unreadCount : 0);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  // Initial load and periodic liveness polling (every 45s)
  useEffect(() => {
    fetchNotifications(true);
    const interval = setInterval(() => {
      fetchNotifications(false);
    }, 45000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Handle outside click & escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Mark single notification as read
  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      const res = await fetch(`/api/notifications/${id}/read`, {
        method: 'PATCH',
      });
      if (!res.ok) {
        // Rollback on failure
        fetchNotifications(false);
      }
    } catch {
      fetchNotifications(false);
    }
  };

  // Mark all notifications as read
  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0) return;
    try {
      // Optimistic update
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);

      const res = await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
      });
      if (!res.ok) {
        fetchNotifications(false);
      }
    } catch {
      fetchNotifications(false);
    }
  };

  // Trigger on-demand maturity scan
  const handleRunScan = async () => {
    try {
      setScanning(true);
      const res = await fetch('/api/notifications/check', { method: 'POST' });
      if (res.ok) {
        await fetchNotifications(false);
      }
    } catch (err) {
      console.error('Scan error:', err);
    } finally {
      setScanning(false);
    }
  };

  // Navigate to deposits page for item
  const handleItemClick = (notification: NotificationItem) => {
    if (!notification.isRead) {
      handleMarkAsRead(notification.id);
    }
    setIsOpen(false);
    if (notification.deposit?.bankName) {
      router.push(`/deposits?search=${encodeURIComponent(notification.deposit.bankName)}`);
    } else {
      router.push('/deposits');
    }
  };

  const displayedNotifications = filterUnreadOnly
    ? notifications.filter((n) => !n.isRead)
    : notifications;

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger Bell Button */}
      <button
        type="button"
        onClick={() => {
          const next = !isOpen;
          setIsOpen(next);
          if (next) fetchNotifications(false);
        }}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-emerald-500"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white shadow-sm ring-2 ring-white dark:ring-slate-900 animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Interactive Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl brand-glass border border-slate-200/90 dark:border-slate-800/90 shadow-2xl z-50 overflow-hidden backdrop-blur-xl bg-white/95 dark:bg-slate-900/95 animate-in fade-in-50 zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-3.5 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-950 dark:text-white">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  {unreadCount} unread
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleRunScan}
                disabled={scanning}
                title="Scan maturity proximity now"
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                <RotateCcw className={`h-3.5 w-3.5 ${scanning ? 'animate-spin text-brand-emerald-600' : ''}`} />
              </button>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  className="flex items-center gap-1 text-[11px] font-semibold text-brand-emerald-600 hover:text-brand-emerald-700 dark:text-brand-emerald-400 px-2 py-1 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>Mark all read</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md sm:hidden"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="px-3.5 py-2 bg-slate-50/60 dark:bg-slate-950/40 border-b border-slate-200/60 dark:border-slate-800/60 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterUnreadOnly(false)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors ${
                !filterUnreadOnly
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterUnreadOnly(true)}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors ${
                filterUnreadOnly
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* List Content */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin text-brand-emerald-600" />
                <span className="text-xs">Loading alerts...</span>
              </div>
            ) : displayedNotifications.length === 0 ? (
              <div className="py-12 px-6 text-center text-slate-400">
                <div className="h-10 w-10 rounded-full bg-emerald-500/10 text-brand-emerald-600 flex items-center justify-center mx-auto mb-2">
                  <Check className="h-5 w-5" />
                </div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {filterUnreadOnly ? 'No unread notifications' : 'No notifications yet'}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Your fixed deposit portfolio is currently up to date.
                </p>
              </div>
            ) : (
              displayedNotifications.map((n) => {
                const badge = getThresholdBadge(n.type, n.severity);
                const BadgeIcon = badge.icon;

                return (
                  <div
                    key={n.id}
                    onClick={() => handleItemClick(n)}
                    className={`p-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition-colors relative flex gap-3 ${
                      !n.isRead ? 'bg-emerald-500/5 dark:bg-emerald-500/5' : ''
                    }`}
                  >
                    {/* Unread indicator dot */}
                    {!n.isRead && (
                      <span className="absolute left-1.5 top-5 h-2 w-2 rounded-full bg-rose-500" />
                    )}

                    <div className="flex-1 min-w-0 pl-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${badge.badgeClass}`}
                        >
                          <BadgeIcon className="h-3 w-3" />
                          <span>{badge.label}</span>
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {formatTimeAgo(n.createdAt)}
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {n.title}
                      </h4>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">
                        {n.message}
                      </p>

                      {n.deposit && (
                        <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                          <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {n.deposit.accountNumber}
                          </span>
                          <span>
                            Payout: ${Number(n.deposit.maturityAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Quick Action: Mark as read */}
                    <div className="shrink-0 flex items-center">
                      {!n.isRead && (
                        <button
                          type="button"
                          onClick={(e) => handleMarkAsRead(n.id, e)}
                          title="Mark as read"
                          className="p-1 text-slate-400 hover:text-brand-emerald-600 dark:hover:text-brand-emerald-400 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between text-xs">
            <Link
              href="/deposits"
              onClick={() => setIsOpen(false)}
              className="text-brand-emerald-600 hover:text-brand-emerald-700 dark:text-brand-emerald-400 font-semibold flex items-center gap-1 text-[11px]"
            >
              <span>Manage Deposits</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
            <span className="text-[10px] text-slate-400">AssetPulse Engine</span>
          </div>
        </div>
      )}
    </div>
  );
}
