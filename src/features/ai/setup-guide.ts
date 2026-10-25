import type { ProviderId } from '@/lib/ai/types';

export const OS_CHOICES = [
  { id: 'windows', label: 'Windows' },
  { id: 'macos', label: 'macOS' },
  { id: 'linux', label: 'Linux / WSL' },
] as const;
export type OsId = (typeof OS_CHOICES)[number]['id'];

export interface GuideStep {
  title: string;
  detail?: string;
  /** Copyable command(s). Fixed text: nothing here is built from user input and nothing here is executed by SignalForge. */
  command?: string;
}

export interface Guide {
  steps: Record<OsId, GuideStep[]>;
  docs: { label: string; href: string }[];
  billing: string;
  troubleshooting: { problem: string; fix: string }[];
}

const DOCS_CHANGE = 'Perintah dapat berubah antar versi; cocokkan dengan halaman dokumentasi resmi di bawah.';

const claudeLogin: GuideStep = {
  title: 'Masuk dengan akun Claude Anda',
  detail: 'Jalankan di terminal, ikuti halaman login di browser. Token disimpan oleh Claude Code, tidak oleh SignalForge.',
  command: 'claude auth login --claudeai',
};
const claudeVerify: GuideStep = {
  title: 'Periksa hasilnya',
  detail: 'Lalu kembali ke sini dan tekan “Periksa status”.',
  command: 'claude auth status',
};

const codexNpm: GuideStep = { title: 'Pasang Codex CLI lewat npm', detail: 'Membutuhkan Node.js.', command: 'npm install -g @openai/codex' };
const codexStandalone: GuideStep = {
  title: 'Pasang Codex CLI (installer resmi)',
  detail: DOCS_CHANGE,
  command: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
};
const codexLogin: GuideStep = {
  title: 'Masuk dengan ChatGPT',
  detail:
    'Cara termudah: tombol “Masuk” di kartu ini (alur kode perangkat; fitur kode perangkat masih beta dan perlu diaktifkan di pengaturan keamanan ChatGPT). Alternatif lewat terminal:',
  command: 'codex login',
};

export const GUIDES: Record<ProviderId, Guide> = {
  claude: {
    steps: {
      windows: [
        { title: 'Pasang Claude Code (PowerShell)', detail: DOCS_CHANGE, command: 'irm https://claude.ai/install.ps1 | iex' },
        claudeLogin,
        claudeVerify,
      ],
      macos: [
        { title: 'Pasang Claude Code', detail: DOCS_CHANGE, command: 'curl -fsSL https://claude.ai/install.sh | bash' },
        claudeLogin,
        claudeVerify,
      ],
      linux: [
        { title: 'Pasang Claude Code (di dalam WSL atau Linux)', detail: DOCS_CHANGE, command: 'curl -fsSL https://claude.ai/install.sh | bash' },
        claudeLogin,
        claudeVerify,
      ],
    },
    docs: [
      { label: 'Claude Code: instalasi dan autentikasi', href: 'https://code.claude.com/docs/en/getting-started' },
      { label: 'Memakai Claude Code dengan paket Pro/Max', href: 'https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan' },
      { label: 'Agent SDK dengan paket Claude', href: 'https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan' },
    ],
    billing:
      'Masuk dengan akun Claude (langganan Pro/Max) memakai kuota langganan. Jika Claude Code diatur memakai API key/Console, pemakaian ditagih per token. SignalForge tidak pernah meneruskan API key dan tidak beralih diam-diam ke penagihan API; kartu akan menandai jika CLI memakai penagihan API.',
    troubleshooting: [
      { problem: 'CLI tidak ditemukan setelah dipasang', fix: 'Tutup dan buka lagi terminal, lalu jalankan SignalForge dari terminal yang baru agar PATH terbaru terbaca. Jika perlu, set SIGNALFORGE_CLAUDE_PATH ke lokasi lengkap claude.' },
      { problem: 'Browser tidak terbuka / callback gagal', fix: 'Jalankan perintah login lagi di terminal dan salin tautan yang dicetak CLI ke browser secara manual.' },
      { problem: 'Sesi kedaluwarsa', fix: 'Jalankan ulang perintah login. SignalForge tidak menghapus kredensial Anda.' },
      { problem: 'Batas pemakaian tercapai', fix: 'Tunggu kuota pulih. SignalForge tidak mencoba ulang otomatis.' },
      { problem: 'Paket tidak didukung', fix: 'Periksa halaman dukungan Anthropic di atas untuk paket yang boleh memakai Claude Code. Jangan menempelkan token ke SignalForge; tidak ada kolom token.' },
      { problem: 'Jaringan tidak tersedia', fix: 'Periksa koneksi internet atau proxy (HTTPS_PROXY diteruskan ke CLI). Data lokal tidak terpengaruh.' },
    ],
  },
  codex: {
    steps: {
      windows: [codexNpm, codexLogin, { title: 'Periksa hasilnya', detail: 'Kembali ke sini dan tekan “Periksa status”.' }],
      macos: [codexStandalone, { ...codexNpm, title: 'Atau lewat npm' }, codexLogin, { title: 'Periksa hasilnya', detail: 'Kembali ke sini dan tekan “Periksa status”.' }],
      linux: [codexStandalone, { ...codexNpm, title: 'Atau lewat npm' }, codexLogin, { title: 'Periksa hasilnya', detail: 'Kembali ke sini dan tekan “Periksa status”.' }],
    },
    docs: [
      { label: 'Codex CLI: instalasi dan masuk', href: 'https://learn.chatgpt.com/docs/codex/cli' },
      { label: 'Codex app-server (protokol)', href: 'https://learn.chatgpt.com/docs/app-server' },
      { label: 'Autentikasi dan penyimpanan kredensial lokal', href: 'https://learn.chatgpt.com/docs/auth' },
    ],
    billing:
      'Masuk dengan ChatGPT memakai kuota paket ChatGPT Anda. Masuk dengan API key ditagih per pemakaian; kartu menandai jika Codex memakai API key. SignalForge tidak pernah meminta atau menyimpan token maupun API key.',
    troubleshooting: [
      { problem: 'CLI tidak ditemukan', fix: 'Buka terminal baru dan jalankan SignalForge dari sana. Jika perlu, set SIGNALFORGE_CODEX_PATH ke lokasi lengkap codex.' },
      { problem: 'Halaman perangkat tidak menerima kode', fix: 'Kode berlaku singkat. Batalkan lalu tekan “Masuk” lagi untuk kode baru.' },
      { problem: 'Sesi kedaluwarsa', fix: 'Tekan “Hubungkan ulang”. Kredensial Codex tidak dihapus oleh SignalForge.' },
      { problem: 'Batas pemakaian tercapai', fix: 'Tunggu kuota pulih. SignalForge tidak mencoba ulang otomatis.' },
      { problem: 'Paket tidak didukung', fix: 'Periksa dokumentasi resmi di atas mengenai paket dan ketentuan pemakaian. Tidak ada kolom token di SignalForge.' },
      { problem: 'Jaringan tidak tersedia', fix: 'Periksa koneksi internet atau proxy. Data lokal tidak terpengaruh.' },
    ],
  },
};
