'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { DateTimeField } from '@/components/ui/DateTimeField';
import { SelectField, TextField } from '@/components/ui/Field';
import { FormErrors } from '@/components/ui/FormErrors';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { DISTRIBUTION_STATUSES, DISTRIBUTION_STATUS_LABELS } from '@/lib/domain/types';
import { idleState, type FormState } from '@/lib/form-state';
import { utcOffsetLabel } from '@/lib/time';

export function DistributionForm({
  action,
  initial,
  platforms,
  timezone,
  platformLocked,
  submitLabel,
  cancelHref,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial: Record<string, string>;
  platforms: { id: string; name: string }[];
  timezone: string;
  /** True when snapshots exist: the platform cannot change (server enforces too). */
  platformLocked: boolean;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, idleState);
  const v = (name: string) => state.values[name] ?? initial[name] ?? '';
  const e = (name: string) => state.fieldErrors[name];

  return (
    <form action={formAction} className="card space-y-5" noValidate>
      <FormErrors state={state} />
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <SelectField
            name={platformLocked ? 'platformIdDisplay' : 'platformId'}
            label="Platform"
            required
            disabled={platformLocked}
            defaultValue={v('platformId')}
            options={platforms.map((p) => ({ value: p.id, label: p.name }))}
            error={e('platformId')}
            hint={platformLocked ? 'Terkunci karena distribusi ini sudah punya snapshot.' : undefined}
          />
          {platformLocked ? <input type="hidden" name="platformId" value={v('platformId')} /> : null}
        </div>
        <SelectField
          name="status"
          label="Status"
          required
          defaultValue={v('status') || 'published'}
          options={DISTRIBUTION_STATUSES.map((s) => ({ value: s, label: DISTRIBUTION_STATUS_LABELS[s] }))}
          error={e('status')}
        />
      </div>
      <DateTimeField
        key={v('publishedAtLocal')}
        name="publishedAtLocal"
        label="Waktu terbit"
        timezone={timezone}
        defaultValue={v('publishedAtLocal')}
        error={e('publishedAtLocal')}
        hint={`Zona waktu: ${timezone} (${utcOffsetLabel(timezone)}). Ubah di Pengaturan. Usia post pada snapshot lama tidak dihitung ulang jika waktu terbit diubah.`}
        blankMeaning="Kosong = waktu terbit tidak diketahui (disimpan sebagai NULL). Perbandingan usia setara tidak bisa dipakai."
      />
      <TextField
        name="postUrl"
        label="URL post"
        type="url"
        hint="Opsional. Hanya disimpan sebagai referensi; SignalForge tidak membuka atau mengambilnya."
        defaultValue={v('postUrl')}
        error={e('postUrl')}
      />
      <div className="grid gap-5 md:grid-cols-2">
        <TextField name="externalPostId" label="ID post platform" hint="Opsional, jika Anda tahu." maxLength={100} defaultValue={v('externalPostId')} error={e('externalPostId')} />
        <TextField
          name="variantLabel"
          label="Label varian"
          hint="Kosongkan untuk post utama. Isi (mis. Repost, Thumbnail B) jika episode punya lebih dari satu post di platform yang sama."
          maxLength={60}
          defaultValue={v('variantLabel')}
          error={e('variantLabel')}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="btn btn-secondary">
          Batal
        </Link>
      </div>
    </form>
  );
}
