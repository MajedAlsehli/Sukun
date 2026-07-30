import { createVisitSchema } from '../visit.dto';

describe('createVisitSchema', () => {
  const base = { projectId: 'project-1', unitId: 'unit-1', time: '10:00' };

  it('rejects a visit date in the past', () => {
    const result = createVisitSchema.safeParse({ ...base, date: '2020-01-01' });
    expect(result.success).toBe(false);
  });

  it('accepts today as a visit date', () => {
    const today = new Date();
    const result = createVisitSchema.safeParse({ ...base, date: today.toISOString() });
    expect(result.success).toBe(true);
  });

  it('accepts a future visit date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 7);
    const result = createVisitSchema.safeParse({ ...base, date: future.toISOString() });
    expect(result.success).toBe(true);
  });
});
