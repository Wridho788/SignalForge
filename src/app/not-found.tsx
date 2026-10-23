import { EmptyState } from '@/components/ui/feedback';

export default function NotFound() {
  return (
    <EmptyState title="Halaman atau data tidak ditemukan" action={{ href: '/', label: 'Kembali ke Ringkasan' }}>
      Alamat yang dibuka tidak ada, atau data yang dimaksud sudah dihapus.
    </EmptyState>
  );
}
