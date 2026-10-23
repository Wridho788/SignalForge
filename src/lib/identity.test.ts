import { describe, expect, it } from 'vitest';
import { ANALYSIS_CYCLE, APP_NAME } from './identity';

describe('product identity', () => {
  it('uses the SignalForge app name', () => {
    expect(APP_NAME).toBe('SignalForge — Content Intelligence');
  });

  it('keeps the analysis cycle in order', () => {
    expect(ANALYSIS_CYCLE).toEqual(['Measure', 'Understand', 'Experiment', 'Improve']);
  });
});
