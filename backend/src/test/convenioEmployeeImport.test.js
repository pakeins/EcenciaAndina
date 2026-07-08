process.env.SUPABASE_URL='http://localhost'; process.env.SUPABASE_SERVICE_ROLE_KEY='test'; process.env.SUPABASE_ANON_KEY='test';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/supabase');
vi.mock('../services/xlsxReader');

const { importConvenioEmployees } = require('../services/convenioEmployeeImport');
const xlsxReader = require('../services/xlsxReader');
const supabase = require('../config/supabase');

describe('Convenio Employee Import Service', () => {
  let mockSupabase;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    };

    supabase.getAdminClient.mockReturnValue(mockSupabase);
  });

  it('debe lanzar error si el archivo o su path no existe', async () => {
    await expect(importConvenioEmployees(null, 'id123', 'admin'))
      .rejects.toThrow('No se ha proporcionado un archivo válido para importar.');
  });

  it('debe procesar empleados simulados de un archivo', async () => {
    const mockFile = { path: '/tmp/test.xlsx', originalname: 'test.xlsx' };
    
    xlsxReader.readXlsxRows.mockReturnValue([
      { cedula: '1234567890', nombres: 'Juan', apellidos: 'Perez', telefono: '0999999999', cupo: 100 }
    ]);

    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { id_rol: 1 } });
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: { id_estado: 1 } });
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null });

    const result = await importConvenioEmployees(mockFile, 'idConvenio123', 'adminId');
    expect(result.processed).toBe(1);
    expect(result.success).toBe(1);
    expect(result.errors).toBe(0);
  });
});
