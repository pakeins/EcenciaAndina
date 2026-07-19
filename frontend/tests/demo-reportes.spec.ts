import { test, expect } from '@playwright/test';

test.describe('Demostración de Dashboard y Reportes', () => {
  test('Flujo de Reporte Consolidado', async ({ page }) => {
    // 1. Ingresar credenciales (Administrador)
    await page.goto('/');
    await page.getByPlaceholder(/correo|email|usuario/i).first().fill('adminecencia');
    await page.getByPlaceholder(/contraseña|password/i).fill('Admin.123');
    await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();

    // 2. Mostrar Dashboard y hacer scroll
    await test.step('Mostrar Dashboard', async () => {
      await expect(page).toHaveURL(/.*dashboard.*/i, { timeout: 10000 });
      // Esperar 10 segundos en la parte superior
      await page.waitForTimeout(10000);
      
      // Hacer scroll hasta abajo
      await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
      
      // Esperar 5 segundos en la parte inferior
      await page.waitForTimeout(5000);
      
      // Volver arriba para continuar
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await page.waitForTimeout(1000);
    });

    // 3. Pestaña de Reportes
    await test.step('Navegar a Reportes y Generar', async () => {
      const btnReportes = page.locator('a:has-text("Reportes"), button:has-text("Reportes")').first();
      await btnReportes.click();
      await expect(page).toHaveURL(/.*reportes.*/i, { timeout: 5000 });
      await page.waitForTimeout(2000);

      // Seleccionar Tipo de Reporte: Consolidado por Convenio
      // El combobox de Tipo de Reporte suele ser el primero
      await page.getByRole('combobox').first().click();
      await page.waitForTimeout(1000);
      await page.getByRole('option', { name: /Consolidado por Convenio/i }).click();
      await page.waitForTimeout(1500);

      // Seleccionar Empresa: Banco Pichincha CA
      // El segundo combobox ahora es el del convenio
      await page.getByRole('combobox').nth(1).click();
      await page.waitForTimeout(1000);
      await page.getByRole('option', { name: /Banco Pichincha/i }).click();
      await page.waitForTimeout(1500);

      // Clic en Generar Reporte
      await page.getByRole('button', { name: /Generar Reporte/i }).click();
      await page.waitForTimeout(3000); // Dar tiempo a que cargue la tabla
      
      // Hacer scroll hasta abajo (donde están los botones y el final de la tabla)
      await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
      await page.waitForTimeout(2000);

      // Activar toggle de desglose
      const toggleLabel = page.locator('text=Desglosar consumos individuales por colaborador');
      if (await toggleLabel.isVisible()) {
        await toggleLabel.click();
      } else {
        await page.getByRole('switch').first().click();
      }
      await page.waitForTimeout(3000);

      // Clic en Exportar PDF
      // En Playwright, al abrir nueva ventana, podemos interceptarla si queremos, 
      // pero para el demo solo necesitamos hacer el clic
      const [newPage] = await Promise.all([
        page.context().waitForEvent('page').catch(() => null),
        page.getByRole('button', { name: /Exportar PDF/i }).click()
      ]);
      
      // Dejamos la ventana nueva (o el proceso) ahí unos segundos para que el jurado lo vea
      await page.waitForTimeout(6000);
    });
  });
});
