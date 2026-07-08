process.env.SUPABASE_URL='http://localhost'; process.env.SUPABASE_SERVICE_ROLE_KEY='test'; process.env.SUPABASE_ANON_KEY='test';
import { describe, it, expect, vi, beforeEach } from 'vitest';
const request = require('supertest');
const express = require('express');

vi.mock('../config/supabase');
vi.mock('../middlewares/authMiddleware', () => {
  return (req, res, next) => {
    req.user = { id: 'admin123', rol: 'administrador' };
    next();
  }
});

const menuRouter = require('../routes/menu');
const supabase = require('../config/supabase');

describe('Menu Router API', () => {
  let app;
  let mockSupabase;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      single: vi.fn().mockResolvedValue({ data: {} }),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      rpc: vi.fn().mockResolvedValue({ data: [] }),
    };

    supabase.getAdminClient.mockReturnValue(mockSupabase);

    app = express();
    app.use(express.json());
    app.use('/', menuRouter);
  });

  it('debe responder 200 OK en GET /history', async () => {
    mockSupabase.select.mockResolvedValueOnce({ data: [] });
    const res = await request(app).get('/history').set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });

  it('debe responder 200 OK en GET /:date (obtener un menú específico)', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { menu_date: '2023-10-10', opciones: {} } });
    const res = await request(app).get('/2023-10-10').set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
  });

  it('debe responder 200 OK en POST /', async () => {
    mockSupabase.single.mockResolvedValueOnce({ data: { id: 1 } });
    const payload = {
      date: '2023-10-10',
      menu: { entradas: [], sopas: [], segundos: [], bebidas: [], postres: [] }
    };
    const res = await request(app).post('/').set('Authorization', 'Bearer token').send(payload);
    expect(res.status).toBe(200);
  });

  it('debe responder 200 OK en POST /notify', async () => {
    const res = await request(app).post('/notify').set('Authorization', 'Bearer token').send({ date: '2023-10-10', previewImageUrl: 'http://img' });
    expect(res.status).toBe(200);
  });
});
