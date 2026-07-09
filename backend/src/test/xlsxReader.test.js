import { describe, it, expect } from 'vitest';
import xlsxReader from '../services/xlsxReader.js';

const { readXlsxRows } = xlsxReader;

describe('xlsxReader Service', () => {
  it('debe rechazar si el archivo no existe o path es inválido', async () => {
    expect(() => readXlsxRows('un_path_invalido.xlsx')).toThrow();
  });
});
