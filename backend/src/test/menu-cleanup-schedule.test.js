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

describe('programacion de limpieza de imagenes', () => {
  it('mantiene conectado el cron diario con el codigo exportado', () => {
    const workflow = JSON.parse(readFileSync(workflowPath, 'utf8'));
    const schedule = workflow.nodes.find((node) => node.name === 'Limpiar imagenes 02:30');
    const cleanup = workflow.nodes.find((node) => node.name === 'Limpiar imagenes antiguas');

    expect(schedule.parameters.rule.interval[0].expression).toBe('30 2 * * *');
    expect(cleanup.parameters.jsCode.replace(/\r/g, '')).toBe(
      readFileSync(codePath, 'utf8').replace(/\r/g, '').trimEnd(),
    );
    expect(workflow.connections['Limpiar imagenes 02:30'].main[0][0].node).toBe(
      'Limpiar imagenes antiguas',
    );
    expect(workflow.settings.timezone).toBe('America/Bogota');
  });
});
