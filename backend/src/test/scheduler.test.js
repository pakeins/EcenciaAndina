import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

const cron = require('node-cron');
const supabase = require('../config/supabase');
const menuImageCleanupService = require('../services/menuImageCleanup');
const outlookMail = require('../services/outlookMail');

// Spy on cron.schedule directly on the required node-cron module
vi.spyOn(cron, 'schedule').mockImplementation(() => ({}));

const mockSupabase = {
  from: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis()
};

vi.spyOn(supabase, 'getAdminClient').mockReturnValue(mockSupabase);
vi.spyOn(menuImageCleanupService, 'cleanupOldMenuImages').mockResolvedValue({ deletedCount: 5 });
vi.spyOn(outlookMail, 'sendOutlookMail').mockResolvedValue({});

let initScheduler;
let expireMenuAndCleanImages;
let notifyExpiringConvenios;
let deactivateExpiredConvenios;

beforeAll(async () => {
  const scheduler = await import('../services/scheduler.js');
  initScheduler = scheduler.initScheduler || scheduler.default?.initScheduler;
  expireMenuAndCleanImages = scheduler.expireMenuAndCleanImages || scheduler.default?.expireMenuAndCleanImages;
  notifyExpiringConvenios = scheduler.notifyExpiringConvenios || scheduler.default?.notifyExpiringConvenios;
  deactivateExpiredConvenios = scheduler.deactivateExpiredConvenios || scheduler.default?.deactivateExpiredConvenios;
});

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

  describe('notifyExpiringConvenios', () => {
    it('debe buscar y no fallar si no hay convenios proximos a expirar', async () => {
      mockSupabase.eq.mockResolvedValueOnce({ data: [{ correo: 'test@admin.com' }] }); // admins
      mockSupabase.eq.mockResolvedValueOnce({ data: [] }); // convenios

      await notifyExpiringConvenios();
      expect(outlookMail.sendOutlookMail).not.toHaveBeenCalled();
    });
  });

  describe('deactivateExpiredConvenios', () => {
    it('debe manejar errores si falla la bd', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockSupabase.from.mockImplementationOnce(() => {
        throw new Error('Fake DB error');
      });
      await deactivateExpiredConvenios();
      expect(errorSpy).toHaveBeenCalled();
    });
  });
});
