import { describe, it, expect } from 'vitest';
import * as ecencia from '../validation/ecencia.js';
import { z } from 'zod';

describe('Ecencia Validation', () => {
  describe('normalizePhone', () => {
    it('deberia normalizar telefonos ecuatorianos', () => {
      expect(ecencia.normalizePhone('0991234567')).toBe('593991234567');
      expect(ecencia.normalizePhone('593991234567')).toBe('593991234567');
      expect(ecencia.normalizePhone('+593 99 123 4567')).toBe('593991234567');
      expect(ecencia.normalizePhone('00593991234567')).toBe('593991234567');
      expect(ecencia.normalizePhone('123456')).toBe('123456');
    });

    it('deberia manejar valores nulos', () => {
      expect(ecencia.normalizePhone(null)).toBeUndefined();
      expect(ecencia.normalizePhone('')).toBeUndefined();
    });
  });

  describe('normalizeEmail', () => {
    it('deberia normalizar emails', () => {
      expect(ecencia.normalizeEmail('Test@Example.com  ')).toBe('test@example.com');
      expect(ecencia.normalizeEmail(null)).toBeUndefined();
      expect(ecencia.normalizeEmail('')).toBeUndefined();
    });
  });

  describe('onlyDigits', () => {
    it('deberia remover caracteres no numericos', () => {
      expect(ecencia.onlyDigits('123-456 abc')).toBe('123456');
      expect(ecencia.onlyDigits(null)).toBe('');
    });
  });

  describe('isValidCedula e isValidRuc', () => {
    it('deberia validar cedulas correctamente', () => {
      expect(ecencia.isValidCedula('1710034065')).toBe(true);
      expect(ecencia.isValidCedula('1724012345')).toBe(false);
      expect(ecencia.isValidCedula('1111111111')).toBe(false);
      expect(ecencia.isValidCedula('2500034065')).toBe(false);
      expect(ecencia.isValidCedula('0000034065')).toBe(false);
      expect(ecencia.isValidCedula('1760034065')).toBe(false);
    });

    it('deberia validar rucs correctamente', () => {
      expect(ecencia.isValidRuc('1710034065001')).toBe(true);
      expect(ecencia.isValidRuc('1724012345001')).toBe(false); // Cedula invalida con tercer digito < 6
      expect(ecencia.isValidRuc('1790011674001')).toBe(true); // Juridico
      expect(ecencia.isValidRuc('1790011675001')).toBe(false); // Juridico digito verificador incorrecto
      expect(ecencia.isValidRuc('1760001550001')).toBe(true); // Publico
      expect(ecencia.isValidRuc('1760001560001')).toBe(false); // Publico digito verificador incorrecto
      expect(ecencia.isValidRuc('1710034065000')).toBe(false); // Sucursal 000 invalido
      expect(ecencia.isValidRuc('123')).toBe(false);
      expect(ecencia.isValidRuc('2590011674001')).toBe(false);
      expect(ecencia.isValidRuc('1770001550001')).toBe(false);
    });

    it('deberia probar casos especiales de modulo11Digit en RUC', () => {
      // Para RUC publico (tercer digito = 6), los coeficientes son [3, 2, 7, 6, 5, 4, 3, 2]
      // Queremos que el residuo de la suma sea 0, asi result = 11 - 0 = 11 -> retorna 0
      // RUC: 17600015 5 0001. Digitos: 1,7,6,0,0,0,1,5
      // Coef: 3,2,7,6,5,4,3,2
      // Suma: 1*3 + 7*2 + 6*7 + 0*6 + 0*5 + 0*4 + 1*3 + 5*2 = 3 + 14 + 42 + 0 + 0 + 0 + 3 + 10 = 72
      // 72 % 11 = 6. Result = 11 - 6 = 5.
      
      // Intentemos diseñar un RUC juridico (tercer digito = 9) con modulo 11 dando residuo 0.
      // Coeficientes: 4, 3, 2, 7, 6, 5, 4, 3, 2
      // Si usamos RUC: 179001167 4 001.
      // Digitos: 1, 7, 9, 0, 0, 1, 1, 6, 7.
      // Suma: 1*4 + 7*3 + 9*2 + 0*7 + 0*6 + 1*5 + 1*4 + 6*3 + 7*2 = 4 + 21 + 18 + 0 + 0 + 5 + 4 + 18 + 14 = 84.
      // 84 % 11 = 7. Result = 11 - 7 = 4. Digito verificador = 4. Es el RUC 1790011674001.
      
      // Busquemos una suma que sea multiplo de 11.
      // Digitos: D1, D2, 9, D4, D5, D6, D7, D8, D9
      // Si sumamos 4*D1 + 3*D2 + 18 + 7*D4 + 6*D5 + 5*D6 + 4*D7 + 3*D8 + 2*D9.
      // Hagamos D1=1, D2=7, D4=0, D5=0, D6=0, D7=0, D8=0, D9=0.
      // Suma = 4 + 21 + 18 + 0 + 0 + 0 + 0 + 0 + 0 = 43.
      // Si D9=2, suma = 43 + 4 = 47.
      // Si D9=4, suma = 43 + 8 = 51.
      // Si D9=5, suma = 43 + 10 = 53.
      // Si D8=1, D9=1, suma = 43 + 3 + 2 = 48.
      // Busquemos una suma que sea 44: 4*D1 + 3*D2 + 18 + 7*D4 + ...
      // Con D1=1, D2=7, D4=0, D5=0, D6=0, D7=0, D8=0, D9=0, la suma parcial es 43. No hay forma de sumar exactamente 1 con digitos enteros >= 0.
      // Probemos con D1=1, D2=2 (provincia 12). Suma parcial = 4 + 6 + 18 = 28.
      // Si queremos suma = 33, necesitamos sumas adicionales = 5.
      // Podemos poner D6=1 (aporta 5).
      // Asi, digitos: 1, 2, 9, 0, 0, 1, 0, 0, 0. RUC: 129001000 0 001.
      // Coeficientes: 4, 3, 2, 7, 6, 5, 4, 3, 2
      // Suma: 1*4 + 2*3 + 9*2 + 0*7 + 0*6 + 1*5 + 0*4 + 0*3 + 0*2 = 4 + 6 + 18 + 5 = 33.
      // 33 % 11 = 0. Result = 11 - 0 = 11 -> retorna 0.
      // Digito verificador (posicion 9, index 9) debe ser 0.
      // Probemos: 1290010000001.
      expect(ecencia.isValidRuc('1290010000001')).toBe(true);

      // Ahora queremos que el result de modulo 11 sea 10 (retorna -1).
      // Esto pasa cuando el residuo es 1. Result = 11 - 1 = 10 -> retorna -1.
      // Queremos que la suma sea un multiplo de 11 mas 1 (ej. 34).
      // Con D1=1, D2=2, D4=0, D5=0, D6=0, D7=0, D8=0, D9=0, suma parcial es 28.
      // Queremos llegar a 34, asi que sumamos 6.
      // Podemos poner D5=1 (aporta 6).
      // Digitos: 1, 2, 9, 0, 1, 0, 0, 0, 0. RUC: 129010000 X 001.
      // Suma: 4 + 6 + 18 + 6 = 34.
      // 34 % 11 = 1. Result = 11 - 1 = 10 -> retorna -1.
      // Dado que retorna -1, y comparamos con un digito real (0-9), siempre sera false.
      // RUC: 1290100000001 (digito verificador 0, pero deberia ser -1). Debe ser false.
      expect(ecencia.isValidRuc('1290100000001')).toBe(false);
    });
  });

  describe('parseBody y validaciones de schemas', () => {
    it('deberia parsear body correctamente si cumple con el esquema', () => {
      const data = {
        identificador: 'usuario@correo.com',
        password: 'password123'
      };
      const parsed = ecencia.parseBody(ecencia.schemas.login, data);
      expect(parsed.identificador).toBe('usuario@correo.com');
      expect(parsed.password).toBe('password123');
    });

    it('deberia lanzar error 400 si el body es invalido', () => {
      expect(() => {
        ecencia.parseBody(ecencia.schemas.login, { identificador: '' });
      }).toThrow();

      try {
        ecencia.parseBody(ecencia.schemas.login, { identificador: '' });
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.payload).toBeDefined();
        expect(err.payload.error).toBeDefined();
      }
    });

    it('deberia probar path vacio en formatValidationError', () => {
      // Usamos un esquema de string simple para provocar un error sin path
      expect(() => {
        ecencia.parseBody(z.string(), 123);
      }).toThrow();

      try {
        ecencia.parseBody(z.string(), 123);
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.payload.detalles[0].campo).toBe('body');
      }
    });

    it('deberia probar esquemas especificos', () => {
      // schemas.refresh
      expect(() => ecencia.parseBody(ecencia.schemas.refresh, {})).toThrow();
      expect(ecencia.parseBody(ecencia.schemas.refresh, { refresh_token: 'tok' })).toEqual({ refresh_token: 'tok' });

      // schemas.forgotPassword
      expect(() => ecencia.parseBody(ecencia.schemas.forgotPassword, { correo: 'invalido' })).toThrow();
      expect(ecencia.parseBody(ecencia.schemas.forgotPassword, { correo: 'test@test.com' })).toEqual({ correo: 'test@test.com' });

      // schemas.clienteCreate
      const clientData = {
        cedula: '1710034065',
        nombre: 'Juan',
        apellido: 'Perez',
        telefono: '0991234567',
        correo: 'juan@perez.com',
        id_tipo_cliente: 1,
        id_convenio: 'd3b07384-d113-4ec5-a5ae-8e2d160d80c3'
      };
      const parsedClient = ecencia.parseBody(ecencia.schemas.clienteCreate, clientData);
      expect(parsedClient.cedula).toBe('1710034065');
      expect(parsedClient.telefono).toBe('0991234567');
      expect(parsedClient.id_tipo_cliente).toBe(1);

      // schemas.clienteUpdate con datos incompletos / opcionales
      const parsedUpdate = ecencia.parseBody(ecencia.schemas.clienteUpdate, {
        activo: 'true',
        id_convenio: ''
      });
      expect(parsedUpdate.activo).toBe(true);
      expect(parsedUpdate.id_convenio).toBeNull();

      // schemas.recarga
      const recargaData = {
        id_producto: 12,
        cantidad_comprada: 5,
        monto_total: 25.5,
        numero_factura: 'F-001-001'
      };
      const parsedRecarga = ecencia.parseBody(ecencia.schemas.recarga, recargaData);
      expect(parsedRecarga.monto_total).toBe(25.5);

      // schemas.convenioCreate
      const convenioData = {
        ruc: '1710034065001',
        nombre_empresa: 'Empresa S.A.',
        representante: 'Representante S.A.',
        telefono: '022234567',
        email: 'empresa@empresa.com',
        fecha_inicio: '2026-01-01',
        fecha_caducidad: '2026-12-31',
        cupo_maximo: 500
      };
      const parsedConvenio = ecencia.parseBody(ecencia.schemas.convenioCreate, convenioData);
      expect(parsedConvenio.ruc).toBe('1710034065001');

      // schemas.convenioAddClient
      expect(ecencia.parseBody(ecencia.schemas.convenioAddClient, { id_cliente: 'd3b07384-d113-4ec5-a5ae-8e2d160d80c3' })).toBeDefined();

      // schemas.productoCreate y productoUpdate
      const productData = {
        id_categoria: 1,
        nombre: 'Almuerzo Ejecutivo',
        precio: '3.50',
        descripcion: 'Rico almuerzo'
      };
      const parsedProduct = ecencia.parseBody(ecencia.schemas.productoCreate, productData);
      expect(parsedProduct.precio).toBe(3.5);

      const parsedProductUpdate = ecencia.parseBody(ecencia.schemas.productoUpdate, { activo: 'false' });
      expect(parsedProductUpdate.activo).toBe(false);

      // schemas.ordenCreate y ordenUpdate
      const orderData = {
        id_cliente: 'd3b07384-d113-4ec5-a5ae-8e2d160d80c3',
        id_estado: 1,
        id_origen: 2,
        canal_origen: 'Telegram',
        observaciones: 'Sin cebolla',
        metodo_pago: 'Efectivo',
        detalles: [
          {
            id_producto: 1,
            cantidad: 2,
            precio_aplicado: 3.5
          }
        ]
      };
      const parsedOrder = ecencia.parseBody(ecencia.schemas.ordenCreate, orderData);
      expect(parsedOrder.detalles[0].id_producto).toBe(1);

      // schemas.empleadoCreate
      const empleadoData = {
        nombre: 'Admin',
        apellido: 'User',
        nombre_usuario: 'admin.user',
        correo: 'admin@ecencia.com',
        password: 'securepassword',
        id_rol: 1
      };
      const parsedEmpleado = ecencia.parseBody(ecencia.schemas.empleadoCreate, empleadoData);
      expect(parsedEmpleado.nombre_usuario).toBe('admin.user');

      // schemas.passwordChange
      const passData = {
        currentPassword: 'old',
        newPassword: 'newpassword123'
      };
      expect(ecencia.parseBody(ecencia.schemas.passwordChange, passData)).toBeDefined();

      // schemas.alimentoCreate
      expect(ecencia.parseBody(ecencia.schemas.alimentoCreate, { id_categoria: 1, nombre: 'Arroz' })).toBeDefined();

      // schemas.menuDiario
      const menuDiarioData = {
        fecha: '2026-07-13',
        alimentos_ids: [1, 2, 3],
        imagen_url: 'https://image.jpg'
      };
      expect(ecencia.parseBody(ecencia.schemas.menuDiario, menuDiarioData)).toBeDefined();

      // schemas.menuDashboard
      const menuDashboardData = {
        opciones: { 'sopa': ['Sopa de pollo', 'Crema de verduras'] },
        image: 'base64image',
        confirmarEdicion: 'true',
        force: 'false',
        clientIds: ['d3b07384-d113-4ec5-a5ae-8e2d160d80c3']
      };
      const parsedDashboard = ecencia.parseBody(ecencia.schemas.menuDashboard, menuDashboardData);
      expect(parsedDashboard.confirmarEdicion).toBe(true);

      // schemas.telegramPrivacyResolution
      const privacyResData = {
        status: 'resolved',
        resolution_notes: 'Ok'
      };
      expect(ecencia.parseBody(ecencia.schemas.telegramPrivacyResolution, privacyResData)).toBeDefined();
    });
  });

  describe('sendValidationError', () => {
    it('deberia enviar error 400 si el error es de tipo validation con status 400', () => {
      let statusCalled = null;
      let jsonCalled = null;
      const res = {
        status: (s) => {
          statusCalled = s;
          return {
            json: (j) => {
              jsonCalled = j;
            }
          };
        }
      };

      const error = new Error('Validation failed');
      error.status = 400;
      error.payload = { error: 'Mensaje de validacion', detalles: [] };

      const sent = ecencia.sendValidationError(res, error);
      expect(sent).toBe(true);
      expect(statusCalled).toBe(400);
      expect(jsonCalled).toEqual(error.payload);
    });

    it('deberia retornar false si el error no es de validacion 400', () => {
      const res = {};
      const error = new Error('Database connection failed');
      error.status = 500;
      const sent = ecencia.sendValidationError(res, error);
      expect(sent).toBe(false);

      expect(ecencia.sendValidationError(res, null)).toBe(false);
      expect(ecencia.sendValidationError(res, { status: 400 })).toBe(false);
    });
  });
});
