'use client';

import React, { useState, useEffect } from 'react';
import {
  Mail,
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  HelpCircle,
  ExternalLink,
  ShieldCheck,
  Server,
  Key,
  Globe,
  BellRing,
} from 'lucide-react';
import { Select, SelectOption } from '@/components/ui/select';

interface NotificationSettingsState {
  emailAlertsEnabled: boolean;
  emailProvider: string;
  emailTo: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword?: string;
  smtpFrom: string;

  telegramAlertsEnabled: boolean;
  telegramBotToken?: string;
  telegramChatId: string;

  notifyMaturedToday: boolean;
  notify7Days: boolean;
  notify14Days: boolean;
  notify30Days: boolean;
}

const PROVIDER_PRESETS: Record<
  string,
  { name: string; host: string; port: number; secure: boolean; hint: string; docUrl?: string }
> = {
  oci: {
    name: 'Oracle Cloud (OCI) Email Delivery (Free Tier: 3,000/mo)',
    host: 'smtp.email.us-ashburn-1.oci.oraclecloud.com',
    port: 587,
    secure: false,
    hint: 'Use your OCI SMTP credentials generated under Identity & Security -> Users -> SMTP Credentials. Ensure Approved Sender is created.',
    docUrl: 'https://docs.oracle.com/en-us/iaas/Content/Email/Concepts/overview.htm',
  },
  gmail: {
    name: 'Google Gmail (Free)',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    hint: 'Generate a 16-character Google App Password under myaccount.google.com/apppasswords.',
    docUrl: 'https://support.google.com/accounts/answer/185833',
  },
  brevo: {
    name: 'Brevo / Sendinblue (Free: 300/day)',
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    hint: 'Get your SMTP key from Brevo dashboard -> Transactional -> SMTP & API.',
    docUrl: 'https://www.brevo.com',
  },
  resend: {
    name: 'Resend (Free: 3,000/mo)',
    host: 'smtp.resend.com',
    port: 465,
    secure: true,
    hint: 'Use "resend" as user and your re_... API Key as password with a verified domain.',
    docUrl: 'https://resend.com',
  },
  custom_smtp: {
    name: 'Custom SMTP Server',
    host: '',
    port: 587,
    secure: false,
    hint: 'Enter your custom or self-hosted SMTP server parameters.',
  },
};

export function NotificationSettingsManager() {
  const [settings, setSettings] = useState<NotificationSettingsState>({
    emailAlertsEnabled: false,
    emailProvider: 'oci',
    emailTo: '',
    smtpHost: PROVIDER_PRESETS.oci.host,
    smtpPort: PROVIDER_PRESETS.oci.port,
    smtpSecure: PROVIDER_PRESETS.oci.secure,
    smtpUser: '',
    smtpPassword: '',
    smtpFrom: '',

    telegramAlertsEnabled: false,
    telegramBotToken: '',
    telegramChatId: '',

    notifyMaturedToday: true,
    notify7Days: true,
    notify14Days: true,
    notify30Days: false,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch current user settings
  useEffect(() => {
    fetch('/api/settings/notifications')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.success && data.settings) {
          setSettings((prev) => ({
            ...prev,
            ...data.settings,
            emailProvider: data.settings.emailProvider || 'oci',
            smtpHost: data.settings.smtpHost || PROVIDER_PRESETS[data.settings.emailProvider || 'oci']?.host || '',
          }));
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const handleProviderChange = (providerKey: string) => {
    const preset = PROVIDER_PRESETS[providerKey];
    if (preset) {
      setSettings((prev) => ({
        ...prev,
        emailProvider: providerKey,
        smtpHost: preset.host || prev.smtpHost,
        smtpPort: preset.port,
        smtpSecure: preset.secure,
      }));
    } else {
      setSettings((prev) => ({ ...prev, emailProvider: providerKey }));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save notification settings');
      }

      setStatusMessage({ type: 'success', text: 'Notification settings successfully saved!' });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error saving settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/settings/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test-email',
          ...settings,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Email connection or dispatch failed');
      }

      setStatusMessage({ type: 'success', text: data.message || 'Test email dispatched successfully!' });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Email test failed' });
    } finally {
      setTestingEmail(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/settings/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test-telegram',
          telegramBotToken: settings.telegramBotToken,
          telegramChatId: settings.telegramChatId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Telegram dispatch failed');
      }

      setStatusMessage({ type: 'success', text: data.message || 'Telegram test ping dispatched!' });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Telegram test failed' });
    } finally {
      setTestingTelegram(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-slate-400 gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-brand-emerald-600" />
        <span className="text-xs">Loading notification preferences...</span>
      </div>
    );
  }

  const currentPreset = PROVIDER_PRESETS[settings.emailProvider] || PROVIDER_PRESETS.custom_smtp;

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {statusMessage && (
        <div
          className={`p-4 rounded-xl flex items-start gap-3 text-xs ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-800 dark:text-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-emerald-600 dark:text-brand-emerald-400 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
          )}
          <span className="font-medium">{statusMessage.text}</span>
        </div>
      )}

      {/* 1. Email Notifications Card (Oracle OCI / Free SMTP) */}
      <div className="p-6 rounded-2xl brand-glass border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3.5">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-brand-emerald-600 dark:text-brand-emerald-400 flex items-center justify-center shrink-0">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-950 dark:text-white flex items-center gap-2">
                <span>Email Maturity Alerts</span>
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-emerald-500/10 text-brand-emerald-700 dark:text-brand-emerald-300 border border-emerald-500/20 font-semibold">
                  Free Tier Ready
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Deliver responsive HTML notifications to your inbox when fixed deposits mature.
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer self-start sm:self-auto">
            <input
              type="checkbox"
              checked={settings.emailAlertsEnabled}
              onChange={(e) => setSettings({ ...settings, emailAlertsEnabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-emerald-600"></div>
          </label>
        </div>

        {settings.emailAlertsEnabled && (
          <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800 animate-in fade-in-0 duration-200">
            {/* Provider Selector with Custom Select Component */}
            <div>
              <Select
                label="Email Service Provider"
                value={settings.emailProvider}
                onChange={(val) => handleProviderChange(val)}
                options={Object.entries(PROVIDER_PRESETS).map(([key, p]) => ({
                  value: key,
                  label: p.name,
                }))}
              />
              {currentPreset.hint && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1.5">
                  <HelpCircle className="h-3 w-3 shrink-0 text-brand-emerald-600" />
                  <span>{currentPreset.hint}</span>
                  {currentPreset.docUrl && (
                    <a
                      href={currentPreset.docUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-emerald-600 dark:text-brand-emerald-400 hover:underline flex items-center gap-0.5 ml-1"
                    >
                      Documentation <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </p>
              )}
            </div>

            {/* When Resend is selected, show streamlined API Key and Sender fields */}
            {settings.emailProvider === 'resend' ? (
              <div className="space-y-3 p-3.5 rounded-xl bg-purple-500/5 border border-purple-500/20">
                <div className="flex items-center gap-2 text-xs font-bold text-purple-700 dark:text-purple-300">
                  <Key className="h-4 w-4" />
                  <span>Resend API Configuration</span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Resend API Key *
                  </label>
                  <input
                    type="password"
                    required={settings.emailAlertsEnabled}
                    value={settings.smtpPassword || ''}
                    onChange={(e) => setSettings({ ...settings, smtpPassword: e.target.value })}
                    placeholder="re_123456789_abcdefghijklmnopqrstuvwxyz"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Get your API key from <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="text-purple-600 dark:text-purple-400 underline font-semibold">resend.com/api-keys</a>. Host (<code className="text-[10px]">smtp.resend.com:465</code>) and user (<code className="text-[10px]">resend</code>) are configured automatically.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* SMTP Host and Port */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      SMTP Host *
                    </label>
                    <input
                      type="text"
                      required={settings.emailAlertsEnabled}
                      value={settings.smtpHost}
                      onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })}
                      placeholder="e.g. smtp.email.us-ashburn-1.oci.oraclecloud.com"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Port *
                    </label>
                    <input
                      type="number"
                      required={settings.emailAlertsEnabled}
                      value={settings.smtpPort}
                      onChange={(e) => setSettings({ ...settings, smtpPort: parseInt(e.target.value, 10) || 587 })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Credentials: User & Password */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      SMTP Username / Access Key *
                    </label>
                    <input
                      type="text"
                      required={settings.emailAlertsEnabled}
                      value={settings.smtpUser}
                      onChange={(e) => setSettings({ ...settings, smtpUser: e.target.value })}
                      placeholder="e.g. ocid1.user.oc1..aaaa@ocid1.tenancy..."
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      SMTP Password / Secret *
                    </label>
                    <input
                      type="password"
                      value={settings.smtpPassword || ''}
                      onChange={(e) => setSettings({ ...settings, smtpPassword: e.target.value })}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </>
            )}

            {/* From Address & To Address */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Sender From Address (Approved Sender) *
                </label>
                <input
                  type="email"
                  required={settings.emailAlertsEnabled}
                  value={settings.smtpFrom}
                  onChange={(e) => setSettings({ ...settings, smtpFrom: e.target.value })}
                  placeholder="alerts@yourdomain.com or notifications@myfinance.com"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Recipient Email (Leave blank to use account email)
                </label>
                <input
                  type="email"
                  value={settings.emailTo}
                  onChange={(e) => setSettings({ ...settings, emailTo: e.target.value })}
                  placeholder="myemail@example.com"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Test Email Button */}
            <div className="pt-1 flex items-center justify-end">
              <button
                type="button"
                onClick={handleTestEmail}
                disabled={
                  testingEmail ||
                  (settings.emailProvider === 'resend'
                    ? !settings.smtpPassword || !settings.smtpFrom
                    : !settings.smtpHost || !settings.smtpUser || !settings.smtpFrom)
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-emerald-500/40 text-brand-emerald-700 dark:text-brand-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
              >
                {testingEmail ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Testing Connection & Sending...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>Send Test Email</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Telegram Notifications Card */}
      <div className="p-6 rounded-2xl brand-glass border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3.5">
            <div className="h-10 w-10 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-950 dark:text-white flex items-center gap-2">
                <span>Telegram Bot Alerts</span>
                <span className="px-2 py-0.5 text-[10px] rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 font-semibold">
                  Free Instant Push
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Receive instant mobile notifications directly from your dedicated Telegram bot.
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer self-start sm:self-auto">
            <input
              type="checkbox"
              checked={settings.telegramAlertsEnabled}
              onChange={(e) => setSettings({ ...settings, telegramAlertsEnabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
          </label>
        </div>

        {settings.telegramAlertsEnabled && (
          <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800 animate-in fade-in-0 duration-200">
            <div className="p-3 rounded-xl bg-sky-500/5 border border-sky-500/20 text-xs text-sky-800 dark:text-sky-300">
              <strong>Quick 2-Minute Setup:</strong>
              <ol className="list-decimal ml-4 mt-1 space-y-0.5 text-[11px]">
                <li>Message <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="underline font-bold">@BotFather</a> on Telegram and send <code>/newbot</code> to get your Bot Token.</li>
                <li>Start a chat with your new bot and send any message (or <code>/start</code>).</li>
                <li>Forward that message to <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" className="underline font-bold">@userinfobot</a> to find your numeric Chat ID.</li>
              </ol>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Telegram Bot Token *
                </label>
                <input
                  type="password"
                  required={settings.telegramAlertsEnabled}
                  value={settings.telegramBotToken || ''}
                  onChange={(e) => setSettings({ ...settings, telegramBotToken: e.target.value })}
                  placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Chat ID / Channel ID *
                </label>
                <input
                  type="text"
                  required={settings.telegramAlertsEnabled}
                  value={settings.telegramChatId}
                  onChange={(e) => setSettings({ ...settings, telegramChatId: e.target.value })}
                  placeholder="e.g. 987654321 or -100123456789"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="pt-1 flex items-center justify-end">
              <button
                type="button"
                onClick={handleTestTelegram}
                disabled={testingTelegram || !settings.telegramChatId}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-sky-500/40 text-sky-700 dark:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 disabled:opacity-50 transition-colors"
              >
                {testingTelegram ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Verifying & Pinging Bot...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    <span>Send Test Telegram Message</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Proximity Threshold Selection */}
      <div className="p-6 rounded-2xl brand-glass border border-slate-200/80 dark:border-slate-800/80 shadow-sm space-y-4">
        <div className="flex items-start gap-3.5">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <BellRing className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-950 dark:text-white">
              Notification Trigger Horizons
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Choose which maturity milestones dispatch external Email and Telegram alerts.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={settings.notifyMaturedToday}
              onChange={(e) => setSettings({ ...settings, notifyMaturedToday: e.target.checked })}
              className="h-4 w-4 rounded text-brand-emerald-600 focus:ring-brand-emerald-500"
            />
            <div className="text-xs">
              <span className="font-bold text-slate-900 dark:text-white block">Day of Maturity (0 Days)</span>
              <span className="text-slate-500 text-[11px]">Immediate alert on the exact maturity date</span>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={settings.notify7Days}
              onChange={(e) => setSettings({ ...settings, notify7Days: e.target.checked })}
              className="h-4 w-4 rounded text-brand-emerald-600 focus:ring-brand-emerald-500"
            />
            <div className="text-xs">
              <span className="font-bold text-slate-900 dark:text-white block">7 Days Before Maturity</span>
              <span className="text-slate-500 text-[11px]">1-week advance notice window</span>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={settings.notify14Days}
              onChange={(e) => setSettings({ ...settings, notify14Days: e.target.checked })}
              className="h-4 w-4 rounded text-brand-emerald-600 focus:ring-brand-emerald-500"
            />
            <div className="text-xs">
              <span className="font-bold text-slate-900 dark:text-white block">14 Days Before Maturity</span>
              <span className="text-slate-500 text-[11px]">2-week advance planning horizon</span>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={settings.notify30Days}
              onChange={(e) => setSettings({ ...settings, notify30Days: e.target.checked })}
              className="h-4 w-4 rounded text-brand-emerald-600 focus:ring-brand-emerald-500"
            />
            <div className="text-xs">
              <span className="font-bold text-slate-900 dark:text-white block">30 Days Before Maturity</span>
              <span className="text-slate-500 text-[11px]">1-month preliminary notice</span>
            </div>
          </label>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-brand-emerald-600 hover:bg-brand-emerald-700 rounded-xl shadow-md shadow-brand-emerald-600/20 disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Saving Preferences...</span>
            </>
          ) : (
            <>
              <ShieldCheck className="h-4 w-4" />
              <span>Save Notification Settings</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
