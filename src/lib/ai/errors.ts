export type AiErrorCode =
  | 'CLI_NOT_FOUND'
  | 'AUTH_REQUIRED'
  | 'AUTH_EXPIRED'
  | 'RATE_LIMITED'
  | 'NETWORK_UNAVAILABLE'
  | 'TIMEOUT'
  | 'PROVIDER_ERROR'
  | 'INVALID_RESPONSE'
  | 'CANCELLED'
  | 'BUSY'
  | 'TOOL_USE_BLOCKED';

/** Safe, user-facing text per code (AI_CONNECTIONS.md §5). Never includes provider output, paths or credentials. */
export const AI_ERROR_INFO: Record<AiErrorCode, { message: string; remediation: string }> = {
  CLI_NOT_FOUND: {
    message: 'Perangkat lunak CLI penyedia tidak ditemukan.',
    remediation: 'Pasang CLI resmi lewat panel "Cara menyiapkan", lalu periksa status lagi.',
  },
  AUTH_REQUIRED: {
    message: 'Anda belum masuk ke penyedia ini.',
    remediation: 'Masuk lewat alur login resmi penyedia (tombol Hubungkan), lalu periksa status.',
  },
  AUTH_EXPIRED: {
    message: 'Sesi login penyedia sudah kedaluwarsa.',
    remediation: 'Hubungkan ulang lewat alur login resmi. SignalForge tidak menghapus kredensial Anda.',
  },
  RATE_LIMITED: {
    message: 'Batas pemakaian penyedia tercapai.',
    remediation: 'Tunggu hingga kuota pulih lalu coba lagi. SignalForge tidak mencoba ulang otomatis.',
  },
  NETWORK_UNAVAILABLE: {
    message: 'Penyedia tidak dapat dijangkau (jaringan).',
    remediation: 'Periksa koneksi internet. Data lokal Anda tidak terpengaruh.',
  },
  TIMEOUT: {
    message: 'Permintaan melewati batas waktu dan dihentikan.',
    remediation: 'Coba lagi, atau persempit data yang dianalisis.',
  },
  PROVIDER_ERROR: {
    message: 'Penyedia mengembalikan galat.',
    remediation: 'Coba lagi nanti. Kode operasi di bawah membantu mencocokkan dengan log lokal.',
  },
  INVALID_RESPONSE: {
    message: 'Respons penyedia tidak sesuai format yang diharapkan dan tidak ditampilkan.',
    remediation: 'Coba lagi. Dasbor tetap bisa dipakai tanpa AI.',
  },
  CANCELLED: {
    message: 'Dibatalkan.',
    remediation: 'Tidak ada data yang diubah.',
  },
  BUSY: {
    message: 'Permintaan lain ke penyedia ini masih berjalan, atau terlalu sering.',
    remediation: 'Tunggu sebentar lalu coba lagi.',
  },
  TOOL_USE_BLOCKED: {
    message: 'Penyedia mencoba memakai tool (file/terminal/web); permintaan dihentikan demi keamanan.',
    remediation: 'Analisis hanya boleh berupa teks. Coba lagi; jika terulang, laporkan kode operasi.',
  },
};

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly operationId: string;
  constructor(code: AiErrorCode, operationId: string = newOperationId()) {
    super(AI_ERROR_INFO[code].message);
    this.name = 'AiError';
    this.code = code;
    this.operationId = operationId;
  }
  get remediation(): string {
    return AI_ERROR_INFO[this.code].remediation;
  }
}

export function newOperationId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/**
 * Maps provider text (stderr / error message) to a safe code. The text itself is NEVER shown or logged by
 * callers — only the resulting code. Order matters: specific causes before generic ones.
 */
export function classifyFailure(text: string): AiErrorCode {
  const t = text.toLowerCase();
  if (/(expired|re-?authenticat|token.*(expired|invalid)|session.*(expired|invalid))/.test(t)) return 'AUTH_EXPIRED';
  if (/(not logged in|not signed in|log ?in required|please (run|log ?in)|unauthori[sz]ed|\b401\b|invalid (api )?key|no (active )?(account|credentials)|authentication (failed|required)|\/login)/.test(t)) {
    return 'AUTH_REQUIRED';
  }
  if (/(rate.?limit|usage.?limit|limit reached|too many requests|\b429\b|quota|overloaded|capacity|budget)/.test(t)) return 'RATE_LIMITED';
  if (/(enotfound|econnrefused|econnreset|etimedout|network|fetch failed|unable to connect|connection (failed|error|refused|reset)|dns|offline|httpconnectionfailed|responsestream)/.test(t)) {
    return 'NETWORK_UNAVAILABLE';
  }
  return 'PROVIDER_ERROR';
}
