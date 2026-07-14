import { beforeAll, describe, expect, it, vi } from 'vitest';
import menuRouter from '../routes/menu.js';

let saveDailyMenu;
let removeUploadedMenuImage;

beforeAll(() => {
  saveDailyMenu = menuRouter._private.saveDailyMenu;
  removeUploadedMenuImage = menuRouter._private.removeUploadedMenuImage;
});

const menu = {
  sopas: ['Sopa de quinoa'],
  segundos: ['Seco de pollo'],
  guarniciones: ['Arroz'],
};

const createAdminClient = ({ rpcError = null } = {}) => {
  const foodIds = [1, 8, 9];
  let foodIndex = 0;
  const rpc = vi.fn(async () => ({ data: rpcError ? null : 3, error: rpcError }));
  const remove = vi.fn(async () => ({ error: null }));

  return {
    rpc,
    remove,
    storage: {
      from: vi.fn(() => ({
        remove,
      })),
    },
    from: vi.fn((table) => {
      if (table === 'categorias_menu') {
        return {
          select: async () => ({
            data: [
              { id_categoria_menu: 1, codigo: 'sopas' },
              { id_categoria_menu: 2, codigo: 'segundos' },
              { id_categoria_menu: 3, codigo: 'guarniciones' },
            ],
            error: null,
          }),
        };
      }

      if (table === 'alimentos') {
        return {
          select: () => ({
            eq: vi.fn(() => ({
              ilike: vi.fn(() => ({
                maybeSingle: async () => ({
                  data: {
                    id_alimento: foodIds[foodIndex++],
                    nombre_alimento: 'Existente',
                    id_categoria_menu: 1,
                  },
                  error: null,
                }),
              })),
            })),
          }),
        };
      }

      throw new Error(`Tabla inesperada: ${table}`);
    }),
  };
};

describe('guardado atomico del menu', () => {
  it('reemplaza el menu mediante una sola llamada RPC', async () => {
    const adminClient = createAdminClient();
    const result = await saveDailyMenu(
      adminClient,
      menu,
      'https://example.test/menu.png',
      'bdea33b6-c7ca-41fc-b1b6-e9a8f2092853',
      '2026-06-12',
    );

    expect(adminClient.rpc).toHaveBeenCalledWith('replace_daily_menu', {
      p_fecha: '2026-06-12',
      p_alimentos_ids: [1, 8, 9],
      p_imagen_url: 'https://example.test/menu.png',
      p_user_id: 'bdea33b6-c7ca-41fc-b1b6-e9a8f2092853',
    });
    expect(result).toEqual({ fecha: '2026-06-12', count: 3 });
  });

  it('propaga el error de la transaccion sin ejecutar borrados REST separados', async () => {
    const adminClient = createAdminClient({ rpcError: { message: 'insert failed' } });

    await expect(
      saveDailyMenu(adminClient, menu, null, 'bdea33b6-c7ca-41fc-b1b6-e9a8f2092853', '2026-06-12'),
    ).rejects.toMatchObject({ message: 'insert failed' });
    expect(adminClient.from).not.toHaveBeenCalledWith('menu_diario');
  });

  it('retira una imagen recien subida cuando el guardado falla', async () => {
    const adminClient = createAdminClient();

    await removeUploadedMenuImage(adminClient, {
      publicUrl: 'https://example.test/menu.png',
      path: 'telegram/menu-dashboard-test.png',
    });

    expect(adminClient.remove).toHaveBeenCalledWith(['telegram/menu-dashboard-test.png']);
    expect(adminClient.storage.from).toHaveBeenCalledWith('ecencia-menu-assets');
  });
});
