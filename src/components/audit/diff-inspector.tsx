'use client';

import React, { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronUp, FileCode } from 'lucide-react';

interface DiffInspectorProps {
  log: any;
}

export function DiffInspector({ log }: DiffInspectorProps) {
  const [copied, setCopied] = useState(false);
  const [viewJson, setViewJson] = useState(false);

  let parsedSnapshot: any = null;
  try {
    parsedSnapshot = typeof log.snapshotData === 'string'
      ? JSON.parse(log.snapshotData)
      : log.snapshotData;
  } catch {
    parsedSnapshot = { raw: log.snapshotData };
  }

  const prev = parsedSnapshot?.previousState;
  const curr = parsedSnapshot?.newState;

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(parsedSnapshot, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-4 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 space-y-4 text-xs font-mono">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-brand-emerald-400" />
          <span className="font-semibold text-slate-300">
            Immutable Audit Event Snapshot • Action: {log.action}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewJson(!viewJson)}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center gap-1"
          >
            <span>{viewJson ? 'Show Diff' : 'Raw JSON'}</span>
            {viewJson ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          <button
            onClick={handleCopy}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center gap-1"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {viewJson || !prev ? (
        <pre className="overflow-x-auto text-[11px] leading-relaxed text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800 max-h-80">
          {JSON.stringify(parsedSnapshot, null, 2)}
        </pre>
      ) : (
        <div className="space-y-2">
          <div className="text-[11px] text-slate-400 font-semibold mb-2">
            State Transition Diff (Previous vs. New State):
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[10px]">
                  <th className="py-1 px-2">Attribute</th>
                  <th className="py-1 px-2 text-rose-400">Previous Value</th>
                  <th className="py-1 px-2 text-emerald-400">New Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-[11px]">
                {['bankName', 'accountNumber', 'principalAmount', 'annualRate', 'compoundingFrequency', 'status'].map((key) => {
                  const valPrev = prev?.[key];
                  const valCurr = curr?.[key];
                  const changed = valPrev !== valCurr;
                  return (
                    <tr key={key} className={changed ? 'bg-slate-800/40' : ''}>
                      <td className="py-1.5 px-2 font-semibold text-slate-400">{key}</td>
                      <td className={`py-1.5 px-2 ${changed ? 'text-rose-300 font-semibold' : 'text-slate-500'}`}>
                        {valPrev !== undefined ? String(valPrev) : '—'}
                      </td>
                      <td className={`py-1.5 px-2 ${changed ? 'text-emerald-300 font-semibold' : 'text-slate-300'}`}>
                        {valCurr !== undefined ? String(valCurr) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Disposition Summary if Closed / Liquidated */}
      {log.dispositionType && (
        <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
          <div>
            <span className="text-slate-500 block">Disposition Type</span>
            <span className="font-semibold text-amber-400">{log.dispositionType}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Destination</span>
            <span className="text-slate-300">{log.destinationAccount || 'N/A'}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Realized Interest</span>
            <span className="text-emerald-400">+${Number(log.realizedInterest || 0).toFixed(2)}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Penalty Deducted</span>
            <span className="text-rose-400">-${Number(log.penaltyAmount || 0).toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
