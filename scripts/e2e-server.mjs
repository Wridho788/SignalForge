// Starts SignalForge for Playwright on loopback with a fresh, isolated database (port 3100).
// Usage: node scripts/e2e-server.mjs --prod   (next start; needs `pnpm build` first) — default for `pnpm test:e2e`
//        node scripts/e2e-server.mjs          (next dev; slower, first hit of each route compiles)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, '.data', 'e2e');
fs.rmSync(dataDir, { recursive: true, force: true });

process.env.SIGNALFORGE_DATA_DIR = dataDir;
// In-process fake AI providers: no CLI is spawned and nothing leaves the machine (scenario: <data dir>/fake-ai.json).
process.env.SIGNALFORGE_AI_MODE = 'fake';
const mode = process.argv.includes('--prod') ? 'start' : 'dev';
process.argv = [process.argv[0], 'next', mode, '-H', '127.0.0.1', '-p', '3100'];
await import(pathToFileURL(path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')).href);
