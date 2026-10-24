'use client';

import { useId, useState } from 'react';
import { LuCheck, LuCopy, LuExternalLink } from 'react-icons/lu';
import { PROVIDER_NAMES, type ProviderId } from '@/lib/ai/types';
import { GUIDES, OS_CHOICES, type OsId } from './setup-guide';

function detectOs(): OsId {
  if (typeof navigator === 'undefined') return 'windows';
  const p = navigator.userAgent.toLowerCase();
  return p.includes('mac') ? 'macos' : p.includes('linux') && !p.includes('android') ? 'linux' : 'windows';
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <>
      <button
        type="button"
        className="btn btn-secondary min-h-9 px-3"
        aria-label={label}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setState('copied');
          } catch {
            setState('failed'); // clipboard may be blocked; the text stays selectable
          }
          setTimeout(() => setState('idle'), 2500);
        }}
      >
        {state === 'copied' ? <LuCheck aria-hidden="true" /> : <LuCopy aria-hidden="true" />}
        {state === 'copied' ? 'Tersalin' : 'Salin'}
      </button>
      <span role="status" className="sr-only">
        {state === 'copied' ? 'Perintah tersalin' : state === 'failed' ? 'Gagal menyalin; pilih teks secara manual' : ''}
      </span>
    </>
  );
}

export function SetupGuide({ provider }: { provider: ProviderId }) {
  const guide = GUIDES[provider];
  const [os, setOs] = useState<OsId>(detectOs);
  const group = useId();
  return (
    <div className="mt-4 space-y-4 rounded-control border border-line bg-canvas p-4">
      <fieldset>
        <legend className="field-label">Sistem operasi</legend>
        <div className="flex flex-wrap gap-2">
          {OS_CHOICES.map((choice) => (
            <label
              key={choice.id}
              className={`btn relative min-h-9 cursor-pointer px-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
                os === choice.id ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface text-ink'
              }`}
            >
              <input type="radio" name={`${group}-os`} value={choice.id} checked={os === choice.id} onChange={() => setOs(choice.id)} className="size-4 accent-primary" />
              {choice.label}
            </label>
          ))}
        </div>
      </fieldset>

      <ol className="space-y-3">
        {guide.steps[os].map((step, i) => (
          <li key={`${os}-${i}`} className="flex gap-3">
            <span aria-hidden="true" className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{step.title}</p>
              {step.detail ? <p className="text-sm text-muted">{step.detail}</p> : null}
              {step.command ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 max-w-full select-all overflow-x-auto whitespace-pre rounded-control border border-line bg-surface px-3 py-1.5 text-sm">{step.command}</code>
                  <CopyButton text={step.command} label={`Salin perintah: ${step.command}`} />
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <div>
        <h4 className="font-semibold">Langganan atau API?</h4>
        <p className="text-sm">{guide.billing}</p>
      </div>

      <div>
        <h4 className="font-semibold">Dokumentasi resmi {PROVIDER_NAMES[provider]}</h4>
        <ul className="mt-1 space-y-1 text-sm">
          {guide.docs.map((d) => (
            <li key={d.href}>
              <a href={d.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline underline-offset-2">
                {d.label}
                <LuExternalLink aria-hidden="true" className="size-3.5" />
                <span className="sr-only">(buka di tab baru)</span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      <details>
        <summary className="cursor-pointer font-semibold">Pemecahan masalah</summary>
        <dl className="mt-2 space-y-2 text-sm">
          {guide.troubleshooting.map((t) => (
            <div key={t.problem}>
              <dt className="font-semibold">{t.problem}</dt>
              <dd className="text-muted">{t.fix}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
