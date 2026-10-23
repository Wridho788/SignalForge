import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/connection';
import { currentSchemaVersion } from '@/lib/db/migrate';

// Liveness + database check. Returns no paths, versions of dependencies, env, or error details.
export function GET() {
  try {
    const schemaVersion = currentSchemaVersion(getDb());
    return NextResponse.json({ status: 'ok', app: 'signalforge', database: 'ok', schemaVersion });
  } catch (error) {
    const operationId = crypto.randomUUID().slice(0, 8);
    console.error(`[op ${operationId}] health check failed: ${error instanceof Error ? error.name : 'unknown'}`);
    return NextResponse.json({ status: 'error', app: 'signalforge', database: 'unavailable', operationId }, { status: 503 });
  }
}
