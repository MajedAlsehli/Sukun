describe('cover-storage (decisions.md E7)', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('reports unavailable and fails honestly when Supabase Storage env vars are unset', async () => {
    delete process.env.SUPABASE_STORAGE_URL;
    delete process.env.SUPABASE_STORAGE_SERVICE_KEY;
    delete process.env.SUPABASE_STORAGE_BUCKET;

    const { coverStorage } = await import('../cover-storage');
    expect(coverStorage.isConfigured()).toBe(false);

    await expect(coverStorage.upload('k', Buffer.from('x'), 'image/jpeg')).rejects.toMatchObject({
      errorCode: 'COVER_STORAGE_NOT_CONFIGURED',
    });
  });

  it('reports available when all three Supabase Storage env vars are set', async () => {
    process.env.SUPABASE_STORAGE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_STORAGE_SERVICE_KEY = 'service-key';
    process.env.SUPABASE_STORAGE_BUCKET = 'project-covers';

    const { coverStorage } = await import('../cover-storage');
    expect(coverStorage.isConfigured()).toBe(true);
  });

  it('reports unavailable when only some of the three env vars are set (partial config is not enough)', async () => {
    process.env.SUPABASE_STORAGE_URL = 'https://example.supabase.co';
    delete process.env.SUPABASE_STORAGE_SERVICE_KEY;
    process.env.SUPABASE_STORAGE_BUCKET = 'project-covers';

    const { coverStorage } = await import('../cover-storage');
    expect(coverStorage.isConfigured()).toBe(false);
  });
});
