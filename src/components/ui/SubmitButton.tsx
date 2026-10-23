'use client';

import { useFormStatus } from 'react-dom';

export function SubmitButton({
  children,
  pendingLabel = 'Menyimpan…',
  variant = 'primary',
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: 'primary' | 'danger';
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`btn ${variant === 'danger' ? 'btn-danger' : 'btn-primary'}`}>
      {pending ? pendingLabel : children}
    </button>
  );
}
