import { beforeAll, describe, expect, it } from 'vitest';

let helpers;

beforeAll(async () => {
  process.env.SUPABASE_URL ||= 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';
  const { default: router } = await import('../routes/convenios.js');
  helpers = router._private;
});

describe('documentos privados de convenios', () => {
  it.each([
    [Buffer.from('%PDF-1.7'), 'application/pdf'],
    [Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg'],
    [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'],
  ])('detecta la firma binaria permitida', (buffer, expectedMimeType) => {
    expect(helpers.detectDocumentMimeType(buffer)).toBe(expectedMimeType);
  });

  it('rechaza contenido cuya firma no es permitida', () => {
    expect(helpers.detectDocumentMimeType(Buffer.from('not-a-document'))).toBeNull();
  });

  it('crea una ruta aislada por convenio y extension canonica', () => {
    const objectPath = helpers.createAgreementObjectPath('agreement-123', 'image/jpeg');
    expect(objectPath).toMatch(
      /^agreement-123\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/,
    );
  });
});
