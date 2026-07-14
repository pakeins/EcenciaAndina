import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Mock sharp before loading menuService
vi.mock('sharp', () => {
  const sharpMock = () => ({
    metadata: vi.fn(async () => ({ width: 100, height: 200 })),
    resize: vi.fn().mockReturnThis(),
    blur: vi.fn().mockReturnThis(),
    composite: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    toBuffer: vi.fn(async () => Buffer.from('processed_image_buffer')),
  });
  return sharpMock;
});

const supabasePath = require.resolve('../config/supabase.js');
const menuImageCleanupPath = require.resolve('../services/menuImageCleanup.js');
const menuCatalogPath = require.resolve('../services/menuCatalog.js');

const mockSupabaseClient = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  neq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  ilike: vi.fn().mockReturnThis(),
  upsert: vi.fn().mockReturnThis(),
  single: vi.fn(),
  maybeSingle: vi.fn(),
  then: vi.fn(),
  rpc: vi.fn(),
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn(async () => ({ error: null })),
      remove: vi.fn(async () => ({ error: null })),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://public-url.com/img.jpg' } }))
    }))
  }
};

const mockSupabaseModule = {
  getAdminClient: () => mockSupabaseClient,
  supabase: mockSupabaseClient
};

delete require.cache[supabasePath];
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: mockSupabaseModule
};

const mockMenuImageCleanup = {
  cleanupOldMenuImages: vi.fn()
};
delete require.cache[menuImageCleanupPath];
require.cache[menuImageCleanupPath] = {
  id: menuImageCleanupPath,
  filename: menuImageCleanupPath,
  loaded: true,
  exports: mockMenuImageCleanup
};

const mockMenuCatalog = {
  findOrCreateFood: vi.fn(async () => ({ id: 100 }))
};
delete require.cache[menuCatalogPath];
require.cache[menuCatalogPath] = {
  id: menuCatalogPath,
  filename: menuCatalogPath,
  loaded: true,
  exports: mockMenuCatalog
};

const menuService = require('../services/menuService.js');

describe('menuService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.then.mockImplementation((resolve) => resolve({ data: [], error: null }));
    mockSupabaseClient.single.mockResolvedValue({ data: null, error: null });
    mockSupabaseClient.maybeSingle.mockResolvedValue({ data: null, error: null });
    mockSupabaseClient.rpc.mockResolvedValue({ data: 1, error: null });
  });

  describe('Utility functions', () => {
    it('cleanOptions filters and cleans arrays', () => {
      expect(menuService.cleanOptions(['  foo  ', null, 'bar', ''])).toEqual(['foo', 'bar']);
      expect(menuService.cleanOptions('not-an-array')).toEqual([]);
    });

    it('normalizeText normalizes correctly', () => {
      expect(menuService.normalizeText('Sôpâ Dë Lëtrás')).toBe('sopa de letras');
    });

    it('todayInTimezone returns date string', () => {
      expect(menuService.todayInTimezone()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('buildMenuOpciones filters and aggregates categories', () => {
      const body = {
        opciones: {
          '1': ['Sopa', ''],
          '2': [null, 'Arroz']
        }
      };
      expect(menuService.buildMenuOpciones(body)).toEqual({
        '1': ['Sopa'],
        '2': ['Arroz']
      });
    });

    it('deriveLegacyMenu maps options to legacy structure', () => {
      const categories = [
        { id_categoria_menu: 1, nombre_categoria: 'Entradas' },
        { id_categoria_menu: 2, nombre_categoria: 'Sopas' },
        { id_categoria_menu: 3, nombre_categoria: 'Segundos Platos' },
        { id_categoria_menu: 4, nombre_categoria: 'Postre' }
      ];
      const opciones = {
        '1': ['Empanada'],
        '2': ['Sopa de pollo'],
        '3': ['Pollo frito'],
        '4': ['Helado']
      };
      const res = menuService.deriveLegacyMenu(opciones, categories);
      expect(res.entradas).toEqual(['Empanada']);
      expect(res.sopas).toEqual(['Sopa de pollo']);
      expect(res.segundos).toEqual(['Pollo frito']);
      expect(res.postres).toEqual(['Helado']);
    });

    it('cleanClientIds cleans input array', () => {
      expect(menuService.cleanClientIds([1, '  2  ', null])).toEqual(['1', '2']);
      expect(menuService.cleanClientIds('invalid')).toEqual([]);
    });

    it('getN8nMenuWebhookUrl validates URL and returns config', () => {
      process.env.NODE_ENV = 'development';
      process.env.N8N_MENU_WEBHOOK_URL = 'http://configured.url';
      expect(menuService.getN8nMenuWebhookUrl()).toBe('http://configured.url/');

      process.env.NODE_ENV = 'production';
      process.env.N8N_MENU_WEBHOOK_URL = 'https://production.url';
      expect(menuService.getN8nMenuWebhookUrl()).toBe('https://production.url/');

      // Localhost validation in prod
      process.env.N8N_MENU_WEBHOOK_URL = 'https://localhost/url';
      expect(() => menuService.getN8nMenuWebhookUrl()).toThrow('N8N_MENU_WEBHOOK_URL no puede apuntar a localhost en produccion.');

      // Non-HTTPS validation in prod
      process.env.N8N_MENU_WEBHOOK_URL = 'http://production.url';
      expect(() => menuService.getN8nMenuWebhookUrl()).toThrow('N8N_MENU_WEBHOOK_URL debe usar HTTPS en produccion.');
    });

    it('isIsoDate validates correctly', () => {
      expect(menuService.isIsoDate('2026-07-13')).toBe(true);
      expect(menuService.isIsoDate('13-07-2026')).toBe(false);
    });

    it('mimeToExtension maps mime types', () => {
      expect(menuService.mimeToExtension('image/png')).toBe('png');
      expect(menuService.mimeToExtension('image/webp')).toBe('webp');
      expect(menuService.mimeToExtension('image/jpeg')).toBe('jpg');
    });

    it('hasAllowedImageSignature validates signatures', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(menuService.hasAllowedImageSignature(pngBuffer, 'image/png')).toBe(true);
      expect(menuService.hasAllowedImageSignature(pngBuffer, 'image/jpeg')).toBe(false);
    });
  });

  describe('Image Operations', () => {
    it('uploadMenuImage returns correct public URL and path', async () => {
      const base64Png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const res = await menuService.uploadMenuImage(base64Png);
      expect(res.publicUrl).toBe('https://public-url.com/img.jpg');
      expect(res.path).toMatch(/^telegram\/menu-dashboard-/);
    });

    it('uploadMenuImage returns direct URL if HTTPS', async () => {
      const res = await menuService.uploadMenuImage('https://test.com/image.png');
      expect(res.publicUrl).toBe('https://test.com/image.png');
    });

    it('uploadMenuImage throws error if non-HTTPS URL', async () => {
      await expect(menuService.uploadMenuImage('http://test.com/image.png'))
        .rejects.toThrow('La URL publica de imagen del menu debe usar HTTPS.');
    });

    it('uploadMenuImage throws if invalid format', async () => {
      await expect(menuService.uploadMenuImage('data:text/plain;base64,abc'))
        .rejects.toThrow('La imagen del menu debe ser JPG, PNG, WebP o una URL publica HTTPS.');
    });

    it('removeUploadedMenuImage deletes from storage', async () => {
      await expect(menuService.removeUploadedMenuImage(mockSupabaseClient, { path: 'telegram/image.png' }))
        .resolves.not.toThrow();
    });

    it('uploadMenuImage throws error if storage upload fails', async () => {
      const originalFrom = mockSupabaseClient.storage.from;
      mockSupabaseClient.storage.from = vi.fn(() => ({
        upload: vi.fn(async () => ({ error: new Error('Upload failed') })),
      }));

      const base64Png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      await expect(menuService.uploadMenuImage(base64Png))
        .rejects.toThrow('No se pudo subir la imagen del menu: Upload failed');

      mockSupabaseClient.storage.from = originalFrom;
    });

    it('removeUploadedMenuImage logs error if storage remove fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const originalFrom = mockSupabaseClient.storage.from;
      mockSupabaseClient.storage.from = vi.fn(() => ({
        remove: vi.fn(async () => ({ error: new Error('Remove failed') })),
      }));

      await menuService.removeUploadedMenuImage(mockSupabaseClient, { path: 'telegram/image.png' });
      expect(consoleErrorSpy).toHaveBeenCalledWith('No se pudo retirar la imagen huerfana del menu:', expect.any(Error));

      mockSupabaseClient.storage.from = originalFrom;
      consoleErrorSpy.mockRestore();
    });

    it('makeSquareWithBlurredBackground returns buffer as-is if sharp fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // In this test, we want sharp mock to throw an error inside makeSquareWithBlurredBackground
      // We will make sharp throw by forcing sharp mock's metadata to throw
      const sharp = require('sharp');
      const originalMetadata = sharp().metadata;
      sharp().metadata = vi.fn().mockRejectedValueOnce(new Error('Sharp metadata error'));

      const buffer = Buffer.from('dummy_buffer');
      const result = await menuService.makeSquareWithBlurredBackground(buffer);
      expect(result).toEqual(buffer);
      expect(consoleErrorSpy).toHaveBeenCalled();

      sharp().metadata = originalMetadata;
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Menu management settings & Fetching', () => {
    it('getMenuSettings returns values', async () => {
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: { active_date: '2026-07-13', image_retention_days: 10 }, error: null });
      const res = await menuService.getMenuSettings(mockSupabaseClient);
      expect(res.active_date).toBe('2026-07-13');
    });

    it('saveActiveMenuState upserts status correctly', async () => {
      mockSupabaseClient.then
        .mockImplementationOnce((resolve) => resolve({ error: null })) // settings
        .mockImplementationOnce((resolve) => resolve({ error: null })); // state
      
      await expect(menuService.saveActiveMenuState(mockSupabaseClient, '2026-07-13', {}, [], 'https://img.com', 1))
        .resolves.not.toThrow();
    });

    it('fetchMenus returns mapped list', async () => {
      mockSupabaseClient.then
        .mockImplementationOnce((resolve) => resolve({
          data: [{
            fecha: '2026-07-13',
            imagen_url: 'img_url',
            alimentos: {
              nombre_alimento: 'Sopa de Pollo',
              id_categoria_menu: 2
            }
          }],
          error: null
        })) // main daily menu query
        .mockImplementationOnce((resolve) => resolve({
          data: [{ fecha: '2026-07-13', last_sent_at: '2026-07-13T10:00:00Z', send_count: 5 }],
          error: null
        })); // menu envios query
      
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: { active_date: '2026-07-13' } }); // settings
      mockSupabaseClient.then.mockImplementationOnce((resolve) => resolve({ data: [{ id_categoria_menu: 2, nombre_categoria: 'Sopas' }] })); // category ids

      const res = await menuService.fetchMenus(mockSupabaseClient);
      expect(res.length).toBe(1);
      expect(res[0].fecha).toBe('2026-07-13');
      expect(res[0].sopas).toEqual(['Sopa de Pollo']);
    });

    it('getMenuByDate returns specific date menu', async () => {
      mockSupabaseClient.then
        .mockImplementationOnce((resolve) => resolve({ data: [], error: null }))
        .mockImplementationOnce((resolve) => resolve({ data: [], error: null }));
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: { active_date: '2026-07-13' } });
      mockSupabaseClient.then.mockImplementationOnce((resolve) => resolve({ data: [] }));

      const res = await menuService.getMenuByDate(mockSupabaseClient, '2026-07-13');
      expect(res).toBeNull();
    });
  });

  describe('Save daily menu & complete logic', () => {
    it('saveDailyMenu replacement RPC executes', async () => {
      const opciones = {
        '2': ['Sopa de lentejas']
      };
      const res = await menuService.saveDailyMenu(mockSupabaseClient, opciones, 'https://url', 10, '2026-07-13');
      expect(res.fecha).toBe('2026-07-13');
      expect(res.count).toBe(1);
    });

    it('secureEquals checks values timing-safely', () => {
      expect(menuService.secureEquals('same', 'same')).toBe(true);
      expect(menuService.secureEquals('same', 'different')).toBe(false);
    });

    it('hasCompleteMenu validates options existence', () => {
      expect(menuService.hasCompleteMenu({ opciones: { '1': ['Arroz'] } })).toBe(true);
      expect(menuService.hasCompleteMenu({})).toBe(false);
    });

    it('menuPayloadEquals compares objects', () => {
      const a = { opciones: { '1': ['Arroz', 'Frijol'] } };
      const b = { opciones: { '1': ['Frijol', 'Arroz'] } };
      const c = { opciones: { '1': ['Arroz'] } };
      expect(menuService.menuPayloadEquals(a, b)).toBe(true);
      expect(menuService.menuPayloadEquals(a, c)).toBe(false);
    });

    it('validateMenuImageInput checks image validations', () => {
      expect(menuService.validateMenuImageInput('https://test.com/image.jpg')).toBe(true);
      expect(() => menuService.validateMenuImageInput('http://test.com/image.jpg'))
        .toThrow('La URL publica de imagen del menu debe usar HTTPS');
      
      expect(() => menuService.validateMenuImageInput(null, { required: true }))
        .toThrow('La imagen del menu es obligatoria');

      // non-required null should pass
      expect(menuService.validateMenuImageInput(null, { required: false })).toBe(true);

      // base64 PNG with valid signature
      const validPngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      expect(menuService.validateMenuImageInput(validPngBase64)).toBe(true);

      // base64 with invalid signature
      const invalidSigBase64 = 'data:image/png;base64,YWJj'; // YWJj is 'abc', fails signature check
      expect(() => menuService.validateMenuImageInput(invalidSigBase64))
        .toThrow('La imagen del menu debe ser JPG, PNG o WebP valida');

      // base64 with non-matching regex pattern
      const badBase64Regex = 'data:image/gif;base64,YWJj';
      expect(() => menuService.validateMenuImageInput(badBase64Regex))
        .toThrow('La imagen del menu debe ser JPG, PNG o WebP valida');
    });
  });
});
