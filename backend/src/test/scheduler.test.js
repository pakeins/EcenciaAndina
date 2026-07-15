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
      mockSupabase.in.mockResolvedValueOnce({ data: [{ correo: 'test@admin.com' }] }); // admins
      mockSupabase.eq.mockResolvedValueOnce({ data: [] }); // convenios

      await notifyExpiringConvenios();
      expect(outlookMail.sendOutlookMail).not.toHaveBeenCalled();
    });

    it.skip('debe enviar correo si hay convenios por expirar', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const targetTime = today.getTime() + (15 * 24 * 60 * 60 * 1000);
      const futureDate = new Date(targetTime);
      const pad = n => n.toString().padStart(2, '0');
      const dateStr = `${futureDate.getFullYear()}-${pad(futureDate.getMonth()+1)}-${pad(futureDate.getDate())}`;

      mockSupabase.in.mockResolvedValueOnce({ data: [{ correo: 'test@admin.com' }] }); // admins
      mockSupabase.eq.mockResolvedValueOnce({ data: [{ nombre_empresa: 'Empresa', fecha_caducidad: dateStr }] }); // convenios

      await notifyExpiringConvenios();
      expect(outlookMail.sendOutlookMail).toHaveBeenCalled();
    });

    it('debe no hacer nada si no hay administradores', async () => {
      mockSupabase.in.mockResolvedValueOnce({ data: [] }); // no admins
      await notifyExpiringConvenios();
      expect(outlookMail.sendOutlookMail).not.toHaveBeenCalled();
    });

    it('debe atrapar error si la bd falla', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockSupabase.from.mockImplementationOnce(() => { throw new Error('DB Error'); });
      await notifyExpiringConvenios();
      expect(errorSpy).toHaveBeenCalled();
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

    it('debe desactivar convenio si la fecha ya paso', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 2);

      const updateMock = vi.fn().mockResolvedValue({ error: null });

      mockSupabase.from.mockImplementation((table) => {
        if (table === 'convenios') {
          return { 
            select: () => ({ eq: () => Promise.resolve({ data: [{ id: 1, nombre_empresa: 'Empresa Test', fecha_caducidad: pastDate.toISOString().split('T')[0] }] }) }),
            update: () => ({ eq: updateMock })
          };
        }
        return mockSupabase;
      });

      await deactivateExpiredConvenios();
      expect(updateMock).toHaveBeenCalled();
    });
  });
});
