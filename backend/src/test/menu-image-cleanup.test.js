import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let cleanupOldMenuImages;
let buildCleanupPlan;

const publicUrl = (name) =>
  `https://example.supabase.co/storage/v1/object/public/eciencia-menu-assets/telegram/${name}`;

beforeAll(() => {
  const cleanupService = require('../services/menuImageCleanup.js');
  cleanupOldMenuImages = cleanupService.cleanupOldMenuImages;
  buildCleanupPlan = cleanupService._private.buildCleanupPlan;
});

describe('limpieza de imagenes antiguas de menus', () => {
  it('elimina archivos administrados que superan la retencion, incluso si quedaron huerfanos', () => {
    const plan = buildCleanupPlan({
      now: new Date('2026-06-10T12:00:00Z'),
      retentionDays: 14,
      activeDate: null,
      menuRows: [],
      files: [
        {
          name: 'menu-dashboard-1746835200000.jpg',
          created_at: '2026-05-10T00:00:00Z',
        },
      ],
    });

    expect(plan.pathsToDelete).toEqual(['telegram/menu-dashboard-1746835200000.jpg']);
  });

  it('respeta el periodo configurado y conserva imagenes recientes', () => {
    const plan = buildCleanupPlan({
      now: new Date('2026-06-10T12:00:00Z'),
      retentionDays: 30,
      activeDate: null,
      menuRows: [],
      files: [
        {
          name: 'menu-dashboard-1749513600000.webp',
          created_at: '2026-06-10T00:00:00Z',
        },
      ],
    });

    expect(plan.retentionDays).toBe(30);
    expect(plan.pathsToDelete).toEqual([]);
  });

  it('conserva la imagen del menu activo aunque el archivo sea antiguo', () => {
    const name = 'menu-dashboard-1746835200000.png';
    const plan = buildCleanupPlan({
      now: new Date('2026-06-10T12:00:00Z'),
      retentionDays: 14,
      activeDate: '2026-05-10',
      menuRows: [{ fecha: '2026-05-10', imagen_url: publicUrl(name) }],
      files: [{ name, created_at: '2026-05-10T00:00:00Z' }],
    });

    expect(plan.pathsToDelete).toEqual([]);
    expect(plan.protected).toBe(1);
  });

  it('conserva una imagen asociada a un menu reciente aunque el archivo original sea antiguo', () => {
    const name = 'menu-dashboard-1746835200000.jpg';
    const plan = buildCleanupPlan({
      now: new Date('2026-06-10T12:00:00Z'),
      retentionDays: 14,
      activeDate: null,
      menuRows: [{ fecha: '2026-06-08', imagen_url: publicUrl(name) }],
      files: [{ name, created_at: '2026-05-10T00:00:00Z' }],
    });

    expect(plan.pathsToDelete).toEqual([]);
    expect(plan.protected).toBe(1);
  });

  it('ignora archivos ajenos al patron de imagenes subidas por el tablero', () => {
    const plan = buildCleanupPlan({
      now: new Date('2026-06-10T12:00:00Z'),
      retentionDays: 14,
      activeDate: null,
      menuRows: [],
      files: [
        { name: 'eciencia-menu-demo.png', created_at: '2025-01-01T00:00:00Z' },
        { name: 'contrato.pdf', created_at: '2025-01-01T00:00:00Z' },
      ],
    });

    expect(plan.pathsToDelete).toEqual([]);
  });

  it('elimina el archivo y limpia solo su referencia de imagen en el menu', async () => {
    const name = 'menu-dashboard-1746835200000.jpg';
    const url = publicUrl(name);
    const remove = vi.fn(async () => ({ error: null }));
    const updateIn = vi.fn(async () => ({ error: null }));
    const adminClient = {
      storage: {
        from: vi.fn(() => ({
          list: vi.fn(async () => ({
            data: [{ name, created_at: '2026-05-10T00:00:00Z' }],
            error: null,
          })),
          remove,
        })),
      },
      from: vi.fn((table) => {
        if (table === 'menu_settings') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { active_date: null, image_retention_days: 14 },
                  error: null,
                }),
              }),
            }),
          };
        }

        return {
          select: () => ({
            not: () => ({
              range: async () => ({
                data: [{ fecha: '2026-05-10', imagen_url: url }],
                error: null,
              }),
            }),
          }),
          update: vi.fn((payload) => ({
            in: async (_field, urls) => {
              expect(payload).toEqual({ imagen_url: null });
              expect(urls).toEqual([url]);
              return updateIn();
            },
          })),
        };
      }),
    };

    const result = await cleanupOldMenuImages(adminClient, {
      now: new Date('2026-06-10T12:00:00Z'),
    });

    expect(remove).toHaveBeenCalledWith([`telegram/${name}`]);
    expect(updateIn).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ deleted: 1, referencesCleared: 1 });
  });
});
