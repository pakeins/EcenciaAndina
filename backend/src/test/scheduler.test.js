import { describe, it, expect, vi, beforeEach } from 'vitest';

const cron = require('node-cron');
const supabase = require('../config/supabase');
const menuImageCleanupService = require('../services/menuImageCleanup');

// Spy on cron.schedule directly on the required node-cron module
vi.spyOn(cron, 'schedule').mockImplementation(() => ({}));

const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis()
};

vi.spyOn(supabase, 'getAdminClient').mockReturnValue(mockSupabase);
vi.spyOn(menuImageCleanupService, 'cleanupOldMenuImages').mockResolvedValue({ deletedCount: 5 });

const { initScheduler, expireMenuAndCleanImages } = require('../services/scheduler');

describe('scheduler service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initScheduler', () => {
    it('debe configurar cron job para la medianoche', () => {
      initScheduler();
      expect(cron.schedule).toHaveBeenCalledWith(
        '0 0 * * *',
        expect.any(Function),
        expect.objectContaining({
          scheduled: true,
          timezone: expect.any(String)
        })
      );
    });
  });

  describe('expireMenuAndCleanImages', () => {
    it('debe expirar menú activo y limpiar imágenes viejas', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await expireMenuAndCleanImages();

      expect(supabase.getAdminClient).toHaveBeenCalled();
      expect(mockSupabase.from).toHaveBeenCalledWith('menu_settings');
      expect(mockSupabase.from).toHaveBeenCalledWith('telegram_bot_state');
      expect(menuImageCleanupService.cleanupOldMenuImages).toHaveBeenCalledWith(mockSupabase);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Imágenes limpiadas: 5'));
    });

    it('debe capturar errores y loguear en console.error', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockSupabase.from.mockImplementationOnce(() => {
        throw new Error('Database down');
      });

      await expireMenuAndCleanImages();

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Error en la limpieza automática'), expect.any(Error));
    });
  });
});
