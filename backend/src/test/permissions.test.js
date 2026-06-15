import { describe, expect, it, vi } from 'vitest';
import roleMiddleware from '../middlewares/roleMiddleware.js';

const createResponse = () => {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
};

describe('matriz de permisos', () => {
  it('permite a caja entrar en operaciones autorizadas', () => {
    const next = vi.fn();
    roleMiddleware(['administrador', 'caja'])(
      { user: { rol: 'caja' } },
      createResponse(),
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it('bloquea analitica financiera para caja', () => {
    const response = createResponse();
    const next = vi.fn();
    roleMiddleware(['administrador'])(
      { user: { rol: 'caja' } },
      response,
      next,
    );
    expect(response.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('permite analitica financiera al administrador', () => {
    const next = vi.fn();
    roleMiddleware(['administrador'])(
      { user: { rol: 'administrador' } },
      createResponse(),
      next,
    );
    expect(next).toHaveBeenCalledOnce();
  });
});
