import { describe, expect, it } from 'vitest';
import { dateInBogota } from './date';

describe('fecha de menu en Bogota', () => {
  it('conserva el dia local antes de medianoche aunque UTC ya sea el dia siguiente', () => {
    expect(dateInBogota(new Date('2026-06-13T03:30:00Z'))).toBe('2026-06-12');
  });
});
