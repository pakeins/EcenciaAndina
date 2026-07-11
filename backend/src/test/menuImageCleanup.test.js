import { describe, expect, it, vi } from 'vitest';
import { cleanupOldMenuImages, _private } from '../services/menuImageCleanup.js';

describe('menuImageCleanup service', () => {
  describe('normalizeRetentionDays', () => {
    it('returns default for invalid values', () => {
      expect(_private.normalizeRetentionDays('abc')).toBe(14);
      expect(_private.normalizeRetentionDays(0)).toBe(14);
      expect(_private.normalizeRetentionDays(366)).toBe(14);
      expect(_private.normalizeRetentionDays(-5)).toBe(14);
    });

    it('returns the valid retention days', () => {
      expect(_private.normalizeRetentionDays(30)).toBe(30);
      expect(_private.normalizeRetentionDays(1)).toBe(1);
      expect(_private.normalizeRetentionDays(365)).toBe(365);
    });
  });

  describe('storagePathFromPublicUrl', () => {
    it('extracts the correct path from a valid Supabase public URL', () => {
      const url = 'https://example.supabase.co/storage/v1/object/public/ecencia-menu-assets/telegram/menu-dashboard-123.jpg';
      expect(_private.storagePathFromPublicUrl(url)).toBe('telegram/menu-dashboard-123.jpg');
    });

    it('handles query parameters correctly', () => {
      const url = 'https://example.supabase.co/storage/v1/object/public/ecencia-menu-assets/telegram/menu-dashboard-123.jpg?t=123';
      expect(_private.storagePathFromPublicUrl(url)).toBe('telegram/menu-dashboard-123.jpg');
    });

    it('returns empty string if marker not found', () => {
      const url = 'https://example.com/other-path/image.jpg';
      expect(_private.storagePathFromPublicUrl(url)).toBe('');
    });
    
    it('returns empty string for falsy input', () => {
      expect(_private.storagePathFromPublicUrl(null)).toBe('');
      expect(_private.storagePathFromPublicUrl(undefined)).toBe('');
    });
  });

  describe('managedFileDate', () => {
    it('uses created_at if available and valid', () => {
      const file = { created_at: '2026-07-01T10:00:00.000Z' };
      const date = _private.managedFileDate(file);
      expect(date).toBeInstanceOf(Date);
      expect(date.toISOString()).toBe('2026-07-01T10:00:00.000Z');
    });

    it('extracts date from managed filename if created_at is missing', () => {
      const timestamp = new Date('2026-07-01T10:00:00.000Z').getTime();
      const file = { name: `menu-dashboard-${timestamp}.jpg` };
      const date = _private.managedFileDate(file);
      expect(date).toBeInstanceOf(Date);
      expect(date.getTime()).toBe(timestamp);
    });

    it('returns null if created_at is invalid and name does not match pattern', () => {
      const file = { name: 'random-image.jpg' };
      expect(_private.managedFileDate(file)).toBeNull();
    });

    it('returns null if timestamp in name is invalid', () => {
      const file = { name: `menu-dashboard-invalid.jpg` };
      expect(_private.managedFileDate(file)).toBeNull();
    });
  });

  describe('buildCleanupPlan', () => {
    it('builds a correct plan protecting active images', () => {
      const now = new Date('2026-07-15T12:00:00.000Z');
      // retention 10 days -> cutoff 2026-07-05
      const oldTimestamp = new Date('2026-07-01T10:00:00.000Z').getTime();
      const newTimestamp = new Date('2026-07-10T10:00:00.000Z').getTime();
      
      const files = [
        { id: 1, name: `menu-dashboard-${oldTimestamp}.jpg`, created_at: new Date(oldTimestamp).toISOString() }, // Should be deleted
        { id: 2, name: `menu-dashboard-${oldTimestamp}.png`, created_at: new Date(oldTimestamp).toISOString() }, // Will be protected
        { id: 3, name: `menu-dashboard-${newTimestamp}.jpg`, created_at: new Date(newTimestamp).toISOString() }, // Should be kept (newer than cutoff)
        { id: null, name: 'invalid-file.txt' }, // Ignored
        { id: 4, name: 'other-image.jpg' }, // Ignored (doesn't match pattern)
      ];

      const menuRows = [
        { imagen_url: `https://example.com/storage/v1/object/public/ecencia-menu-assets/telegram/menu-dashboard-${oldTimestamp}.png`, fecha: '2026-07-06' }, // Protected because fecha >= cutoff
        { imagen_url: `https://example.com/storage/v1/object/public/ecencia-menu-assets/telegram/menu-dashboard-${oldTimestamp}.jpg`, fecha: '2026-07-01' }, // Not protected (fecha < cutoff and not activeDate)
      ];

      const plan = _private.buildCleanupPlan({
        files,
        menuRows,
        activeDate: '2026-07-15',
        retentionDays: 10,
        now,
      });

      expect(plan.retentionDays).toBe(10);
      expect(plan.cutoffDate).toBe('2026-07-05');
      expect(plan.scanned).toBe(5);
      expect(plan.protected).toBe(1);
      expect(plan.pathsToDelete).toHaveLength(1);
      expect(plan.pathsToDelete[0]).toBe(`telegram/menu-dashboard-${oldTimestamp}.jpg`);
      expect(plan.urlsToClear).toHaveLength(1);
    });
  });

  describe('cleanupOldMenuImages', () => {
    it('executes cleanup process correctly', async () => {
      const now = new Date('2026-07-15T12:00:00.000Z');
      const oldTimestamp = new Date('2026-07-01T10:00:00.000Z').getTime();
      
      const mockSettings = { active_date: '2026-07-15', image_retention_days: 10 };
      const mockMenuRows = [
        { imagen_url: `https://example.com/storage/v1/object/public/ecencia-menu-assets/telegram/menu-dashboard-${oldTimestamp}.jpg`, fecha: '2026-07-01' },
      ];
      const mockFiles = [
        { id: 1, name: `menu-dashboard-${oldTimestamp}.jpg`, created_at: new Date(oldTimestamp).toISOString() },
      ];

      const adminClient = {
        from: vi.fn().mockImplementation((table) => {
          if (table === 'menu_settings') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: mockSettings, error: null }),
            };
          }
          if (table === 'menu_diario') {
            return {
              select: vi.fn().mockReturnThis(),
              not: vi.fn().mockReturnThis(),
              range: vi.fn().mockResolvedValueOnce({ data: mockMenuRows, error: null }).mockResolvedValueOnce({ data: [], error: null }),
              update: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }
        }),
        storage: {
          from: vi.fn().mockReturnValue({
            list: vi.fn().mockResolvedValueOnce({ data: mockFiles, error: null }).mockResolvedValueOnce({ data: [], error: null }),
            remove: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        },
      };

      const result = await cleanupOldMenuImages(adminClient, { now });
      
      expect(result.deleted).toBe(1);
      expect(result.referencesCleared).toBe(1);
      expect(result.scanned).toBe(1);
      expect(adminClient.storage.from('ecencia-menu-assets').remove).toHaveBeenCalledWith([`telegram/menu-dashboard-${oldTimestamp}.jpg`]);
    });

    it('returns empty stats if nothing to delete', async () => {
      const adminClient = {
        from: vi.fn().mockImplementation((table) => {
          if (table === 'menu_settings') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: {}, error: null }),
            };
          }
          if (table === 'menu_diario') {
            return {
              select: vi.fn().mockReturnThis(),
              not: vi.fn().mockReturnThis(),
              range: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
          }
        }),
        storage: {
          from: vi.fn().mockReturnValue({
            list: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        },
      };

      const result = await cleanupOldMenuImages(adminClient);
      
      expect(result.deleted).toBe(0);
      expect(result.referencesCleared).toBe(0);
      expect(result.scanned).toBe(0);
    });

    it('throws if getCleanupSettings fails', async () => {
      const adminClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new Error('DB Error') }),
        }),
      };

      await expect(cleanupOldMenuImages(adminClient)).rejects.toThrow('DB Error');
    });

    it('throws if listStorageFiles fails', async () => {
      const adminClient = {
        from: vi.fn().mockImplementation((table) => {
          if (table === 'menu_settings') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: {}, error: null }),
            };
          }
          if (table === 'menu_diario') {
            return {
              select: vi.fn().mockReturnThis(),
              not: vi.fn().mockReturnThis(),
              range: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
          }
        }),
        storage: {
          from: vi.fn().mockReturnValue({
            list: vi.fn().mockResolvedValue({ data: null, error: new Error('Storage Error') }),
          }),
        },
      };

      await expect(cleanupOldMenuImages(adminClient)).rejects.toThrow('Storage Error');
    });
    
    it('throws if delete fails', async () => {
      const now = new Date('2026-07-15T12:00:00.000Z');
      const oldTimestamp = new Date('2026-07-01T10:00:00.000Z').getTime();
      
      const adminClient = {
        from: vi.fn().mockImplementation((table) => {
          if (table === 'menu_settings') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: {}, error: null }),
            };
          }
          if (table === 'menu_diario') {
            return {
              select: vi.fn().mockReturnThis(),
              not: vi.fn().mockReturnThis(),
              range: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
          }
        }),
        storage: {
          from: vi.fn().mockReturnValue({
            list: vi.fn().mockResolvedValueOnce({ data: [{ id: 1, name: `menu-dashboard-${oldTimestamp}.jpg`, created_at: new Date(oldTimestamp).toISOString() }], error: null }).mockResolvedValueOnce({ data: [], error: null }),
            remove: vi.fn().mockResolvedValue({ data: null, error: new Error('Remove Error') }),
          }),
        },
      };

      await expect(cleanupOldMenuImages(adminClient, { now })).rejects.toThrow('Remove Error');
    });
    
    it('throws if database update fails', async () => {
      const now = new Date('2026-07-15T12:00:00.000Z');
      const oldTimestamp = new Date('2026-07-01T10:00:00.000Z').getTime();
      
      const adminClient = {
        from: vi.fn().mockImplementation((table) => {
          if (table === 'menu_settings') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: {}, error: null }),
            };
          }
          if (table === 'menu_diario') {
            return {
              select: vi.fn().mockReturnThis(),
              not: vi.fn().mockReturnThis(),
              range: vi.fn().mockResolvedValueOnce({ data: [{ imagen_url: `https://example.com/storage/v1/object/public/ecencia-menu-assets/telegram/menu-dashboard-${oldTimestamp}.jpg`, fecha: '2026-06-01' }], error: null }).mockResolvedValueOnce({ data: [], error: null }),
              update: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({ data: null, error: new Error('Update Error') }),
            };
          }
        }),
        storage: {
          from: vi.fn().mockReturnValue({
            list: vi.fn().mockResolvedValueOnce({ data: [{ id: 1, name: `menu-dashboard-${oldTimestamp}.jpg`, created_at: new Date(oldTimestamp).toISOString() }], error: null }).mockResolvedValueOnce({ data: [], error: null }),
            remove: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        },
      };

      await expect(cleanupOldMenuImages(adminClient, { now })).rejects.toThrow('Update Error');
    });
  });
});
