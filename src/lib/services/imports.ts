import 'server-only';
import type { DatabaseSync } from 'node:sqlite';
import { CSV_COLUMNS, CSV_SCHEMA_VERSION, TEXT_COLUMNS, type CsvColumn } from '../csv/format';
import { decodeUtf8, parseCsv, toCsv, unguardFormula } from '../csv/csv';
import { parseCsvTimestamp } from '../csv/timestamp';
import { DomainError, NotFoundError } from '../domain/errors';
import { PLATFORM_IDS, type PlatformId } from '../domain/types';
import { inTransaction } from '../db/tx';
import { parseMetricInput } from '../metrics/parse';
import { findDuplicateDistributionId, getDistributionRow, insertDistribution } from '../repositories/distributions';
import { findEpisodeIdByCode, findEpisodeIdsByTitle, insertEpisode, touchEpisode } from '../repositories/episodes';
import {
  expireOldPreviews,
  finishImportJob,
  getImportContent,
  getImportJob,
  insertImportJob,
  listImportJobs,
  type DuplicatePolicy,
  type ImportJobRow,
} from '../repositories/imports';
import { listMetricDefinitionRows, type MetricDefinitionRow } from '../repositories/metric-definitions';
import { findCurrentSnapshotAt, insertSnapshot, insertSnapshotValue } from '../repositories/snapshots';
import { postAgeSeconds } from '../time';
import { parseHttpUrl } from '../validation/common';

const FUTURE_SKEW_MS = 5 * 60 * 1000;
const PREVIEW_TTL_MS = 24 * 3600 * 1000;
const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const STATES = ['known', 'not_available', 'not_applicable'] as const;
type PlannedState = (typeof STATES)[number];

export interface ImportRowError {
  line: number;
  /** Column name, or null for row/group-level problems. Messages never echo cell contents. */
  column: string | null;
  message: string;
}

export interface PlannedValue {
  metricDefinitionId: string;
  state: PlannedState;
  numericValue: number | null;
  textValue: string | null;
}

export interface PlannedSnapshot {
  capturedAt: string;
  note: string | null;
  values: PlannedValue[];
  lines: number[];
  /** A current snapshot already exists at this instant for the distribution. */
  existingSnapshotId: string | null;
}

export interface PlannedDistribution {
  key: string;
  episodeKey: string;
  platformId: PlatformId;
  variantLabel: string | null;
  publishedAt: string | null;
  postUrl: string | null;
  existingDistributionId: string | null;
  snapshots: PlannedSnapshot[];
}

export interface PlannedEpisode {
  key: string;
  existingId: string | null;
  code: string | null;
  title: string | null;
}

export interface ImportPlan {
  totalRows: number;
  errors: ImportRowError[];
  rejectedRows: number;
  validRows: number;
  episodes: PlannedEpisode[];
  distributions: PlannedDistribution[];
  warnings: string[];
  /** Rows whose timestamps had no offset and were read in the app time zone. */
  assumedLocalTimeRows: number;
  summary: {
    newEpisodes: number;
    reusedEpisodes: number;
    newDistributions: number;
    reusedDistributions: number;
    snapshotsToCreate: number;
    duplicateSnapshots: number;
    valueRows: number;
  };
}

interface ParsedRow {
  line: number;
  errors: ImportRowError[];
  code: string | null;
  title: string | null;
  platformId: PlatformId | null;
  variant: string | null;
  publishedAt: string | null;
  postUrl: string | null;
  capturedAt: string | null;
  def: MetricDefinitionRow | null;
  state: PlannedState | null;
  numeric: number | null;
  text: string | null;
  note: string | null;
  episodeKey: string | null;
  distKey: string | null;
  snapKey: string | null;
  assumedLocal: boolean;
}

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[^A-Za-z0-9._ -]/g, '_').trim().slice(0, 120);
  return cleaned || 'import.csv';
}

export function describeFileProblem(name: string, size: number): string | null {
  if (!/\.csv$/i.test(name)) return 'Hanya file .csv yang diterima.';
  if (size === 0) return 'File kosong.';
  return null;
}

/** Reads every row, validates it, resolves it against the database, and builds a plan. Never writes. */
export function planImport(db: DatabaseSync, text: string, timezone: string, now: Date = new Date()): ImportPlan {
  const parsed = parseCsv(text);
  if (!parsed.ok) throw new DomainError(parsed.error);

  // --- header ---
  const header = parsed.header;
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const h of header) {
    if (seen.has(h)) problems.push(`Kolom "${h}" muncul lebih dari sekali.`);
    seen.add(h);
    if (!(CSV_COLUMNS as readonly string[]).includes(h)) problems.push(`Kolom tidak dikenal: "${h.slice(0, 40)}".`);
  }
  for (const c of CSV_COLUMNS) if (!seen.has(c)) problems.push(`Kolom wajib tidak ada: "${c}".`);
  if (problems.length > 0) {
    throw new DomainError(`Header CSV tidak sesuai template v${CSV_SCHEMA_VERSION}. ${problems.slice(0, 5).join(' ')}`);
  }
  const index = new Map<CsvColumn, number>(header.map((h, i) => [h as CsvColumn, i]));

  const defsByKey = new Map<string, MetricDefinitionRow[]>();
  for (const d of listMetricDefinitionRows(db)) defsByKey.set(d.key, [...(defsByKey.get(d.key) ?? []), d]);

  const warnings: string[] = [];
  const rows: ParsedRow[] = parsed.rows.map((rec) => {
    const row: ParsedRow = {
      line: rec.line, errors: [], code: null, title: null, platformId: null, variant: null, publishedAt: null, postUrl: null,
      capturedAt: null, def: null, state: null, numeric: null, text: null, note: null, episodeKey: null, distKey: null, snapKey: null, assumedLocal: false,
    };
    const err = (column: string | null, message: string) => row.errors.push({ line: rec.line, column, message });
    if (rec.cells.length !== header.length) {
      err(null, `Jumlah kolom (${rec.cells.length}) tidak sama dengan header (${header.length}).`);
      return row;
    }
    const raw = (c: CsvColumn) => rec.cells[index.get(c)!]!;
    const cell = (c: CsvColumn) => {
      const v = raw(c).trim();
      const value = (TEXT_COLUMNS as readonly string[]).includes(c) ? unguardFormula(v) : v;
      if (CONTROL.test(value)) err(c, `Mengandung karakter kontrol yang tidak diizinkan.`);
      return value;
    };

    if (cell('schema_version') !== CSV_SCHEMA_VERSION) err('schema_version', `schema_version harus "${CSV_SCHEMA_VERSION}".`);

    // identity
    const code = cell('episode_code');
    const title = cell('episode_title');
    if (code && !CODE_RE.test(code)) err('episode_code', 'Kode episode: huruf/angka, boleh . _ -, maksimal 32 karakter.');
    else if (code) row.code = code;
    if (title.length > 200) err('episode_title', 'Judul episode maksimal 200 karakter.');
    else if (title) row.title = title;
    if (!code && !title) err('episode_code', 'Isi episode_code atau episode_title.');

    const platform = cell('platform').toLowerCase();
    if (!(PLATFORM_IDS as readonly string[]).includes(platform)) err('platform', 'platform harus facebook, youtube, atau tiktok.');
    else row.platformId = platform as PlatformId;

    const variant = cell('variant_label');
    if (variant.length > 60) err('variant_label', 'Label varian maksimal 60 karakter.');
    else row.variant = variant || null;

    const url = cell('post_url');
    if (url) {
      if (url.length > 2000 || parseHttpUrl(url) === null) err('post_url', 'post_url harus URL http:// atau https:// yang valid.');
      else row.postUrl = url;
    }

    const published = cell('published_at');
    if (published) {
      const ts = parseCsvTimestamp(published, timezone);
      if (!ts.ok) err('published_at', 'Format waktu tidak valid. Gunakan ISO-8601 dengan Z/offset, atau YYYY-MM-DD HH:mm.');
      else {
        row.publishedAt = ts.iso;
        row.assumedLocal ||= ts.assumedLocal;
      }
    }

    const note = cell('note');
    if (note.length > 1000) err('note', 'Catatan maksimal 1000 karakter.');
    else row.note = note || null;

    // measurement part
    const captured = cell('captured_at');
    const metricKey = cell('metric_key');
    if (captured || metricKey) {
      if (!captured) err('captured_at', 'captured_at wajib bila metric_key diisi.');
      if (!metricKey) err('metric_key', 'metric_key wajib bila captured_at diisi.');
      if (captured) {
        const ts = parseCsvTimestamp(captured, timezone);
        if (!ts.ok) err('captured_at', 'Format waktu tidak valid. Gunakan ISO-8601 dengan Z/offset, atau YYYY-MM-DD HH:mm.');
        else if (Date.parse(ts.iso) > now.getTime() + FUTURE_SKEW_MS) err('captured_at', 'captured_at tidak boleh di masa depan.');
        else {
          row.capturedAt = ts.iso;
          row.assumedLocal ||= ts.assumedLocal;
        }
      }
      if (metricKey && row.platformId) {
        const candidates = (defsByKey.get(metricKey) ?? []).filter((d) => d.platformId === null || d.platformId === row.platformId);
        const def = candidates[0];
        if (!def) err('metric_key', 'metric_key tidak dikenal untuk platform ini (lihat Pengaturan → Metrik).');
        else if (!def.isActive) err('metric_key', 'Metrik ini nonaktif.');
        else row.def = def;
      }
      const stateRaw = cell('value_state').toLowerCase() || 'known';
      if (!(STATES as readonly string[]).includes(stateRaw)) {
        err('value_state', 'value_state harus known, not_available, atau not_applicable. Untuk "tidak diketahui", jangan sertakan barisnya.');
      } else {
        row.state = stateRaw as PlannedState;
        const value = cell('value');
        if (row.state === 'known') {
          if (!value) err('value', 'value wajib untuk value_state known (kosong berarti tidak diketahui, bukan 0).');
          else if (row.def) {
            const p = parseMetricInput(value, row.def);
            if (!p.ok) err('value', p.error);
            else {
              row.numeric = p.numericValue;
              row.text = p.textValue;
            }
          }
        } else if (value) {
          err('value', 'Kosongkan value untuk not_available / not_applicable.');
        }
      }
      const unit = cell('unit');
      if (unit && row.def && unit.toLowerCase() !== row.def.unit.toLowerCase()) {
        err('unit', `unit tidak cocok dengan definisi metrik (seharusnya "${row.def.unit}").`);
      }
    } else {
      if (cell('value_state') || cell('value') || cell('unit')) err(null, 'value_state/value/unit diisi tanpa captured_at dan metric_key.');
    }

    // keys
    if (row.platformId && (row.code || row.title)) {
      row.episodeKey = row.code ? `c:${row.code.toLowerCase()}` : `t:${row.title!.toLowerCase()}`;
      row.distKey = `${row.episodeKey}|${row.platformId}|${(row.variant ?? '').toLowerCase()}`;
      if (row.capturedAt) row.snapKey = `${row.distKey}|${row.capturedAt}`;
    }
    return row;
  });

  const errorsFor = (r: ParsedRow, column: string | null, message: string) => r.errors.push({ line: r.line, column, message });

  // --- episodes: merge title-only rows into a coded episode of the same title when that one is new in this file ---
  const titleToCodedKey = new Map<string, string>();
  for (const r of rows) if (r.episodeKey?.startsWith('c:') && r.title) titleToCodedKey.set(r.title.toLowerCase(), r.episodeKey);
  const resolvedKey = new Map<string, string>();
  for (const r of rows) {
    if (!r.episodeKey) continue;
    if (r.episodeKey.startsWith('t:')) {
      const coded = titleToCodedKey.get(r.episodeKey.slice(2));
      if (coded && !findEpisodeIdsByTitle(db, r.title!).length) {
        resolvedKey.set(r.episodeKey, coded);
        r.episodeKey = coded;
        r.distKey = `${coded}|${r.platformId}|${(r.variant ?? '').toLowerCase()}`;
        if (r.capturedAt) r.snapKey = `${r.distKey}|${r.capturedAt}`;
      }
    }
  }

  const episodeInfo = new Map<string, PlannedEpisode>();
  const episodeRows = new Map<string, ParsedRow[]>();
  for (const r of rows) if (r.episodeKey) episodeRows.set(r.episodeKey, [...(episodeRows.get(r.episodeKey) ?? []), r]);
  for (const [key, group] of episodeRows) {
    const code = group.find((r) => r.code)?.code ?? null;
    const title = group.find((r) => r.title)?.title ?? null;
    let existingId: string | null = null;
    if (code) existingId = findEpisodeIdByCode(db, code) ?? null;
    else {
      const ids = findEpisodeIdsByTitle(db, title!);
      if (ids.length > 1) for (const r of group) errorsFor(r, 'episode_title', 'Judul cocok dengan lebih dari satu episode; gunakan episode_code.');
      else existingId = ids[0] ?? null;
    }
    if (!existingId && !title) for (const r of group) errorsFor(r, 'episode_title', 'episode_title wajib untuk membuat episode baru.');
    episodeInfo.set(key, { key, existingId, code, title });
  }

  // --- distributions ---
  const distInfo = new Map<string, PlannedDistribution>();
  for (const r of rows) {
    if (!r.distKey || !r.platformId) continue;
    let d = distInfo.get(r.distKey);
    if (!d) {
      const ep = episodeInfo.get(r.episodeKey!)!;
      const existing = ep.existingId ? findDuplicateDistributionId(db, ep.existingId, r.platformId, r.variant) ?? null : null;
      d = {
        key: r.distKey, episodeKey: r.episodeKey!, platformId: r.platformId, variantLabel: r.variant, publishedAt: null, postUrl: null,
        existingDistributionId: existing, snapshots: [],
      };
      if (existing) d.publishedAt = getDistributionRow(db, existing)?.publishedAt ?? null;
      distInfo.set(r.distKey, d);
    }
    if (r.publishedAt) {
      if (d.existingDistributionId) {
        if (d.publishedAt && d.publishedAt !== r.publishedAt && !warnings.some((w) => w.includes(`baris ${r.line}`))) {
          warnings.push(`published_at pada baris ${r.line} berbeda dari data yang sudah ada; data yang ada dipakai.`);
        }
      } else if (d.publishedAt && d.publishedAt !== r.publishedAt) {
        errorsFor(r, 'published_at', 'published_at berbeda dengan baris lain untuk distribusi yang sama.');
      } else d.publishedAt = r.publishedAt;
    }
    if (r.postUrl && !d.postUrl && !d.existingDistributionId) d.postUrl = r.postUrl;
  }

  // --- snapshots ---
  const groups = new Map<string, ParsedRow[]>();
  for (const r of rows) if (r.snapKey) groups.set(r.snapKey, [...(groups.get(r.snapKey) ?? []), r]);
  for (const [, group] of groups) {
    const dist = distInfo.get(group[0]!.distKey!)!;
    const metrics = new Set<string>();
    let note: string | null = null;
    for (const r of group) {
      if (r.def) {
        if (metrics.has(r.def.id)) errorsFor(r, 'metric_key', 'metric_key muncul lebih dari sekali pada snapshot yang sama.');
        metrics.add(r.def.id);
      }
      if (r.note) {
        if (note && note !== r.note) errorsFor(r, 'note', 'note berbeda untuk snapshot yang sama.');
        note ||= r.note;
      }
      if (dist.publishedAt && r.capturedAt && Date.parse(r.capturedAt) < Date.parse(dist.publishedAt)) {
        errorsFor(r, 'captured_at', 'captured_at lebih awal dari waktu terbit distribusi.');
      }
    }
  }

  // --- taint: if any row of a snapshot group is invalid, the whole snapshot is dropped (no half snapshots) ---
  const rejected = new Set<number>();
  const errors: ImportRowError[] = [];
  for (const r of rows) {
    for (const e of r.errors) errors.push(e);
    if (r.errors.length > 0) rejected.add(r.line);
  }
  for (const [, group] of groups) {
    if (group.some((r) => r.errors.length > 0)) {
      for (const r of group) {
        if (r.errors.length === 0) {
          errors.push({ line: r.line, column: null, message: 'Dilewati: baris lain pada snapshot yang sama tidak valid, sehingga snapshot ini tidak diimpor.' });
          rejected.add(r.line);
        }
      }
    }
  }
  errors.sort((a, b) => a.line - b.line);
  const clean = rows.filter((r) => !rejected.has(r.line));

  // --- assemble the plan from clean rows only ---
  const usedEpisodes = new Set(clean.map((r) => r.episodeKey).filter((k): k is string => !!k));
  const planDists = new Map<string, PlannedDistribution>();
  for (const r of clean) {
    if (!r.distKey) continue;
    const base = distInfo.get(r.distKey)!;
    let d = planDists.get(r.distKey);
    if (!d) {
      d = { ...base, snapshots: [] };
      planDists.set(r.distKey, d);
    }
    if (r.snapKey && r.capturedAt && r.def && r.state) {
      let s = d.snapshots.find((x) => x.capturedAt === r.capturedAt);
      if (!s) {
        s = {
          capturedAt: r.capturedAt, note: r.note, values: [], lines: [],
          existingSnapshotId: d.existingDistributionId ? findCurrentSnapshotAt(db, d.existingDistributionId, r.capturedAt) ?? null : null,
        };
        d.snapshots.push(s);
      }
      s.note ||= r.note;
      s.lines.push(r.line);
      s.values.push({ metricDefinitionId: r.def.id, state: r.state, numericValue: r.numeric, textValue: r.text });
    }
  }

  const planEpisodes = [...usedEpisodes].map((k) => episodeInfo.get(k)!);
  const planDistributions = [...planDists.values()];
  const allSnapshots = planDistributions.flatMap((d) => d.snapshots);
  if (planDistributions.some((d) => !d.existingDistributionId && d.snapshots.length > 0 && !d.publishedAt)) {
    warnings.push('Ada distribusi baru tanpa published_at; usia post snapshot-nya akan tidak diketahui (tidak bisa dipakai untuk perbandingan usia setara).');
  }
  const assumed = rows.filter((r) => r.assumedLocal).length;

  return {
    totalRows: rows.length,
    errors,
    rejectedRows: rejected.size,
    validRows: rows.length - rejected.size,
    episodes: planEpisodes,
    distributions: planDistributions,
    warnings,
    assumedLocalTimeRows: assumed,
    summary: {
      newEpisodes: planEpisodes.filter((e) => !e.existingId).length,
      reusedEpisodes: planEpisodes.filter((e) => e.existingId).length,
      newDistributions: planDistributions.filter((d) => !d.existingDistributionId).length,
      reusedDistributions: planDistributions.filter((d) => d.existingDistributionId).length,
      snapshotsToCreate: allSnapshots.filter((s) => !s.existingSnapshotId).length,
      duplicateSnapshots: allSnapshots.filter((s) => s.existingSnapshotId).length,
      valueRows: allSnapshots.reduce((n, s) => n + s.values.length, 0),
    },
  };
}

// --- job lifecycle ---

function summarizeErrors(errors: ImportRowError[]): string | null {
  if (errors.length === 0) return null;
  const head = errors.slice(0, 10).map((e) => `Baris ${e.line}${e.column ? ` (${e.column})` : ''}: ${e.message}`);
  return `${errors.length} masalah. ${head.join(' | ')}`;
}

/** Validates the upload, plans it, and stores it as a 'previewed' job. Nothing is written to content tables. */
export function stageImport(db: DatabaseSync, file: { name: string; bytes: Uint8Array }, timezone: string, now: Date = new Date()): string {
  const fileName = sanitizeFileName(file.name);
  const problem = describeFileProblem(fileName, file.bytes.byteLength);
  if (problem) throw new DomainError(problem, { file: problem });
  const decoded = decodeUtf8(file.bytes);
  if (!decoded.ok) throw new DomainError(decoded.error, { file: decoded.error });

  let plan: ImportPlan;
  try {
    plan = planImport(db, decoded.text, timezone, now);
  } catch (e) {
    if (e instanceof DomainError) throw new DomainError(e.message, { file: e.message });
    throw e;
  }
  expireOldPreviews(db, new Date(now.getTime() - PREVIEW_TTL_MS).toISOString());
  return insertImportJob(db, {
    fileName,
    content: decoded.text,
    startedAt: now.toISOString(),
    rowsTotal: plan.totalRows,
    rowsValid: plan.validRows,
    rowsRejected: plan.rejectedRows,
    errorSummary: summarizeErrors(plan.errors),
  });
}

export interface ImportPreview {
  job: ImportJobRow;
  plan: ImportPlan;
}

/** Re-plans from the staged content so the preview always reflects the current database. */
export function getImportPreview(db: DatabaseSync, jobId: string, timezone: string, now: Date = new Date()): ImportPreview {
  const job = getImportJob(db, jobId);
  if (!job) throw new NotFoundError('Impor');
  const content = getImportContent(db, jobId);
  if (job.status !== 'previewed' || content === null) {
    throw new DomainError('Pratinjau ini sudah selesai atau kedaluwarsa. Unggah file lagi untuk mengimpor.');
  }
  return { job, plan: planImport(db, content, timezone, now) };
}

export function getFinishedImport(db: DatabaseSync, jobId: string): ImportJobRow {
  const job = getImportJob(db, jobId);
  if (!job) throw new NotFoundError('Impor');
  return job;
}

export function recentImports(db: DatabaseSync): ImportJobRow[] {
  return listImportJobs(db);
}

export function cancelImport(db: DatabaseSync, jobId: string): void {
  const job = getImportJob(db, jobId);
  if (!job) throw new NotFoundError('Impor');
  if (job.status !== 'previewed') return;
  finishImportJob(db, jobId, { status: 'cancelled' });
}

export interface CommitOptions {
  duplicatePolicy: DuplicatePolicy;
  /** Import the valid rows even though some rows were rejected. Off by default (all-or-nothing). */
  allowPartial: boolean;
}

export interface CommitResult {
  episodesCreated: number;
  distributionsCreated: number;
  snapshotsCreated: number;
  duplicatesSkipped: number;
  rowsRejected: number;
}

/**
 * Applies the plan in ONE transaction. By default any rejected row blocks the whole import; with
 * `allowPartial` only clean snapshot groups are imported and the rejected count is recorded on the job.
 */
export function commitImport(
  db: DatabaseSync,
  jobId: string,
  options: CommitOptions,
  timezone: string,
  now: Date = new Date(),
): CommitResult {
  const { job, plan } = getImportPreview(db, jobId, timezone, now);
  if (plan.rejectedRows > 0 && !options.allowPartial) {
    throw new DomainError(`Masih ada ${plan.rejectedRows} baris yang ditolak. Perbaiki file, atau pilih mengimpor hanya baris yang valid.`);
  }
  if (plan.summary.snapshotsToCreate + (options.duplicatePolicy === 'supersede' ? plan.summary.duplicateSnapshots : 0) === 0 &&
      plan.summary.newEpisodes === 0 && plan.summary.newDistributions === 0) {
    throw new DomainError('Tidak ada yang bisa diimpor dari file ini (semua baris ditolak atau sudah ada).');
  }

  try {
    const result = inTransaction(db, (): CommitResult => {
      const episodeIds = new Map<string, string>();
      let episodesCreated = 0;
      for (const e of plan.episodes) {
        if (e.existingId) {
          episodeIds.set(e.key, e.existingId);
        } else {
          episodeIds.set(e.key, insertEpisode(db, {
            episodeCode: e.code, title: e.title!, workingTitle: null, premise: null, format: null, durationSeconds: null, scriptText: null, notes: null,
          }));
          episodesCreated++;
        }
      }
      let distributionsCreated = 0;
      let snapshotsCreated = 0;
      let duplicatesSkipped = 0;
      for (const d of plan.distributions) {
        const episodeId = episodeIds.get(d.episodeKey)!;
        let distributionId = d.existingDistributionId;
        const publishedAt = d.publishedAt;
        if (!distributionId) {
          distributionId = insertDistribution(db, episodeId, {
            platformId: d.platformId, status: d.publishedAt ? 'published' : 'unknown', postUrl: d.postUrl, publishedAt: d.publishedAt,
            externalPostId: null, variantLabel: d.variantLabel,
          });
          distributionsCreated++;
        }
        for (const s of d.snapshots) {
          if (s.existingSnapshotId && options.duplicatePolicy === 'skip') {
            duplicatesSkipped++;
            continue;
          }
          const snapshotId = insertSnapshot(db, {
            distributionId, capturedAt: s.capturedAt, postAgeSeconds: postAgeSeconds(publishedAt, s.capturedAt), source: 'csv_import',
            note: s.note, supersedesSnapshotId: s.existingSnapshotId, importJobId: job.id,
          });
          for (const v of s.values) {
            insertSnapshotValue(db, { snapshotId, metricDefinitionId: v.metricDefinitionId, numericValue: v.numericValue, textValue: v.textValue, valueState: v.state });
          }
          snapshotsCreated++;
        }
        touchEpisode(db, episodeId);
      }
      finishImportJob(db, jobId, {
        status: 'committed',
        duplicatePolicy: options.duplicatePolicy,
        rowsTotal: plan.totalRows,
        rowsValid: plan.validRows,
        rowsRejected: plan.rejectedRows,
        snapshotsCreated,
        errorSummary: summarizeErrors(plan.errors),
      });
      return { episodesCreated, distributionsCreated, snapshotsCreated, duplicatesSkipped, rowsRejected: plan.rejectedRows };
    });
    return result;
  } catch (error) {
    // The transaction rolled back everything; record that nothing was imported.
    finishImportJob(db, jobId, { status: 'failed', errorSummary: 'Impor gagal dan dibatalkan; tidak ada data yang diubah.' });
    throw error instanceof DomainError ? error : new DomainError('Impor gagal dan dibatalkan; tidak ada data yang diubah.');
  }
}

/** Row errors as a CSV the user can open next to the original file (no cell contents echoed). */
export function errorsToCsv(errors: ImportRowError[]): string {
  return toCsv([['line', 'column', 'message'], ...errors.map((e) => [String(e.line), e.column ?? '', e.message])]);
}
