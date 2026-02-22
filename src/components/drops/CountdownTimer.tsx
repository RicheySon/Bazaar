'use client';

import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

interface CountdownTimerProps {
  targetTime: number; // unix timestamp (seconds)
  onExpire?: () => void;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function CountdownTimer({ targetTime, onExpire, size = 'md', label }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(() => Math.max(0, targetTime - Math.floor(Date.now() / 1000)));

  useEffect(() => {
    if (remaining <= 0) {
      onExpire?.();
      return;
    }
    const id = setInterval(() => {
      const r = Math.max(0, targetTime - Math.floor(Date.now() / 1000));
      setRemaining(r);
      if (r === 0) onExpire?.();
    }, 1000);
    return () => clearInterval(id);
  }, [targetTime, onExpire]);

  const days    = Math.floor(remaining / 86400);
  const hours   = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  const unitClass = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }[size];

  const numClass = {
    sm: 'text-lg font-bold',
    md: 'text-2xl font-bold',
    lg: 'text-4xl font-black',
  }[size];

  if (remaining <= 0) {
    return (
      <div className="flex items-center gap-1.5" style={{ color: 'var(--accent)' }}>
        <Clock className="h-3.5 w-3.5" />
        <span className={`font-semibold ${unitClass}`}>Live Now</span>
      </div>
    );
  }

  const segments = days > 0
    ? [
        { value: days,    label: 'Days' },
        { value: hours,   label: 'Hrs' },
        { value: minutes, label: 'Min' },
        { value: seconds, label: 'Sec' },
      ]
    : [
        { value: hours,   label: 'Hrs' },
        { value: minutes, label: 'Min' },
        { value: seconds, label: 'Sec' },
      ];

  return (
    <div className="inline-flex flex-col gap-1">
      {label && (
        <div className={`${unitClass} font-medium`} style={{ color: 'var(--text-muted)' }}>
          {label}
        </div>
      )}
      <div className="flex items-end gap-2">
        {segments.map(({ value, label: lbl }, i) => (
          <div key={lbl} className="flex items-end gap-2">
            <div className="flex flex-col items-center">
              <div
                className={`${numClass} font-mono tabular-nums px-2 py-1 rounded-lg`}
                style={{ background: 'var(--bg-secondary)', color: 'var(--accent)', minWidth: size === 'lg' ? '3rem' : '2.5rem', textAlign: 'center' }}
              >
                {pad(value)}
              </div>
              <div className={`${unitClass} mt-1`} style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                {lbl}
              </div>
            </div>
            {i < segments.length - 1 && (
              <span
                className={`${numClass} pb-5`}
                style={{ color: 'var(--text-muted)', lineHeight: 1 }}
              >
                :
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
