import type { Migration } from '../migrate';
import { migration0001 } from './0001_foundation';
import { migration0002 } from './0002_content';
import { migration0003 } from './0003_metrics';

export const MIGRATIONS: readonly Migration[] = [migration0001, migration0002, migration0003];
