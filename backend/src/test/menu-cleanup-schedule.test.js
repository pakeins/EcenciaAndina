import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const backendDirectory = join(testDirectory, '..', '..');
const workflowPath = join(
  backendDirectory,
  'n8n',
  'workflows',
  'eciencia_telegram_menu_reservas.workflow.json',
);
const codePath = join(backendDirectory, 'n8n', 'code', 'limpiar-imagenes-programadas.js');
const closeReservationsCodePath = join(backendDirectory, 'n8n', 'code', 'cerrar-reservas-programadas.js');
const expireActiveMenuCodePath = join(backendDirectory, 'n8n', 'code', 'expirar-menu-activo.js');
const normalizeNewlines = (value) => String(value || '').replace(/\r\n/g, '\n').trim();

describe('programacion de limpieza de imagenes', () => {
  it('mantiene conectado el cron diario con el codigo exportado', () => {
    const workflow = JSON.parse(readFileSync(workflowPath, 'utf8'));
    const schedule = workflow.nodes.find((node) => node.name === 'Limpiar imagenes 02:30');
    const cleanup = workflow.nodes.find((node) => node.name === 'Limpiar imagenes antiguas');

    expect(schedule.parameters.rule.interval[0].expression).toBe('30 2 * * *');
    expect(normalizeNewlines(cleanup.parameters.jsCode)).toBe(
      normalizeNewlines(readFileSync(codePath, 'utf8')),
    );
    expect(workflow.connections['Limpiar imagenes 02:30'].main[0][0].node).toBe(
      'Limpiar imagenes antiguas',
    );
    expect(workflow.settings.timezone).toBe('America/Bogota');
  });

  it('mantiene programados el cierre de reservas y la expiracion del menu activo', () => {
    const workflow = JSON.parse(readFileSync(workflowPath, 'utf8'));
    const closeSchedule = workflow.nodes.find((node) => node.name === 'Cerrar reservas 15:00');
    const closeReservations = workflow.nodes.find((node) => node.name === 'Cerrar reservas pendientes');
    const expireSchedule = workflow.nodes.find((node) => node.name === 'Expirar menu activo 18:00');
    const expireActiveMenu = workflow.nodes.find((node) => node.name === 'Expirar menu activo');

    expect(closeSchedule.parameters.rule.interval[0].expression).toBe('0 15 * * *');
    expect(normalizeNewlines(closeReservations.parameters.jsCode)).toBe(
      normalizeNewlines(readFileSync(closeReservationsCodePath, 'utf8')),
    );
    expect(workflow.connections['Cerrar reservas 15:00'].main[0][0].node).toBe(
      'Cerrar reservas pendientes',
    );

    expect(expireSchedule.parameters.rule.interval[0].expression).toBe('0 18 * * *');
    expect(normalizeNewlines(expireActiveMenu.parameters.jsCode)).toBe(
      normalizeNewlines(readFileSync(expireActiveMenuCodePath, 'utf8')),
    );
    expect(workflow.connections['Expirar menu activo 18:00'].main[0][0].node).toBe(
      'Expirar menu activo',
    );
  });
});
