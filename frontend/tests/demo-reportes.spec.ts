import { test, expect } from '@playwright/test';

test.describe('Demostración de Dashboard y Reportes', () => {
  test('Flujo de Reporte Consolidado', async ({ page }) => {
    test.setTimeout(300000); // Darle 5 minutos de tiempo de vida al test para evitar cortes
    // 1. Ingresar credenciales (Administrador)
    await page.goto('/');
    await page.getByPlaceholder(/correo|email|usuario/i).first().fill('adminecencia');
    await page.getByPlaceholder(/contraseña|password/i).fill('Admin.123');
    await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();

    // 2. Mostrar Dashboard y hacer scroll
    await test.step('Mostrar Dashboard', async () => {
      await expect(page).toHaveURL(/.*dashboard.*/i, { timeout: 10000 });
      // Esperar 14 segundos al inicio (añadiendo los 2 seg extras solicitados)
      await page.waitForTimeout(14000);

      // Ir al menú desplegable de periodo y cambiar a "Esta Semana"
      const dropdownPeriodo = page.getByRole('combobox').first();
      if (await dropdownPeriodo.isVisible()) {
        // Resaltar para el demo
        await dropdownPeriodo.evaluate((node: HTMLElement) => node.style.border = '2px solid red');
        await dropdownPeriodo.click();

        // Dejar abierto unos 3 segundos para que se vea
        await page.waitForTimeout(3000);

        // Resaltar la opción "Esta Semana" antes de hacerle clic
        const opcionSemana = page.getByRole('option', { name: /Esta Semana/i });
        if (await opcionSemana.isVisible()) {
          await opcionSemana.evaluate((node: HTMLElement) => {
            node.style.border = '3px solid red';
            node.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
            node.style.color = 'black';
          });
          await page.waitForTimeout(2000);
        }
        await opcionSemana.click();
      }

      // Una vez seleccionado, esperamos 5 segundos para que se vean los cambios en las tarjetas
      await page.waitForTimeout(5000);

      // Hacer scroll totalmente para abajo hasta los convenios
      // Como tu layout usa <main className="overflow-auto">, el scroll debe hacerse directamente en <main>
      const mainContainer = page.locator('main').first();
      if (await mainContainer.isVisible()) {
        await mainContainer.evaluate((node: HTMLElement) => {
          node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
        });
      }

      // Esperar 12 segundos en la parte de convenios para que tengas suficiente tiempo de explicar
      await page.waitForTimeout(12000);

      // Volver arriba para continuar a la pestaña de reportes
      if (await mainContainer.isVisible()) {
        await mainContainer.evaluate((node: HTMLElement) => {
          node.scrollTo({ top: 0, behavior: 'smooth' });
        });
      }
      await page.waitForTimeout(1000);
    });

    // 3. Pestaña de Reportes
    await test.step('Navegar a Reportes y Generar', async () => {
      // Usamos el rol específico 'link' para evitar ambigüedades con botones o layouts móviles
      const btnReportes = page.getByRole('link', { name: /Reportes/i }).first();
      await btnReportes.click({ force: true });
      await expect(page).toHaveURL(/.*reportes.*/i, { timeout: 5000 });
      await page.waitForTimeout(2000);

      // Seleccionar Tipo de Reporte: Consolidado por Convenio
      // El combobox de Tipo de Reporte suele ser el primero
      await page.getByRole('combobox').first().click();
      await page.waitForTimeout(5000);

      // Resaltar la opción "Consolidado por Convenio" antes de hacerle clic
      const opcionConsolidado = page.getByRole('option', { name: /Consolidado por Convenio/i });
      if (await opcionConsolidado.isVisible()) {
        await opcionConsolidado.evaluate((node: HTMLElement) => {
          node.style.border = '3px solid red';
          node.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
          node.style.color = 'black';
        });
        await page.waitForTimeout(2000); // Pausa de 2 segundos para que el jurado note el recuadro
      }
      await opcionConsolidado.click();
      await page.waitForTimeout(3000);

      // Seleccionar Empresa: Banco Pichincha CA
      // El segundo combobox ahora es el del convenio
      await page.getByRole('combobox').nth(1).click();
      await page.waitForTimeout(1000);
      await page.getByRole('option', { name: /Banco Pichincha/i }).click();
      await page.waitForTimeout(1500);

      // Clic en Generar Reporte
      await page.getByRole('button', { name: /Generar Reporte/i }).click();
      await page.waitForTimeout(3000); // Dar tiempo a que cargue la tabla

      // Hacer scroll hasta abajo (usando el contenedor principal igual que en el dashboard)
      const mainContainerReportes = page.locator('main').first();
      if (await mainContainerReportes.isVisible()) {
        await mainContainerReportes.evaluate((node: HTMLElement) => {
          node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
        });
      }
      await page.waitForTimeout(2000);

      // Resaltar el TOGGLE (switch) directamente en lugar del texto
      const switchBtn = page.getByRole('switch').first();
      if (await switchBtn.isVisible()) {
        await switchBtn.evaluate((node: HTMLElement) => {
          node.style.border = '3px solid red';
          node.style.borderRadius = '20px'; // Para que siga la forma redondeada del toggle
          node.style.padding = '2px';
        });
        await page.waitForTimeout(2000); // Pausa para que el jurado note el recuadro
        await switchBtn.click();
      } else {
        // Fallback por si acaso
        const toggleLabel = page.locator('text=Desglosar consumos individuales por colaborador');
        await toggleLabel.click();
      }

      // Una vez activado, desplazamos un poquito más para abajo porque aparecen más datos
      if (await mainContainerReportes.isVisible()) {
        await mainContainerReportes.evaluate((node: HTMLElement) => {
          node.scrollBy({ top: 350, behavior: 'smooth' });
        });
      }

      // Pausa larga para que tengas tiempo de explicar la tabla y los datos que aparecieron
      await page.waitForTimeout(12000);

      // Botones de Exportación: CSV, XML, PDF
      const exportBtns = [
        { name: /Exportar CSV|CSV/i },
        { name: /Exportar XML|XML/i },
        { name: /Exportar PDF|PDF/i }
      ];

      for (const btnInfo of exportBtns) {
        const btn = page.getByRole('button', btnInfo).first();
        if (await btn.isVisible()) {
          // 1. Resaltar en rojo
          await btn.evaluate((node: HTMLElement) => {
            node.style.outline = '3px solid red';
            node.style.transform = 'scale(1.05)';
            node.style.transition = 'all 0.2s';
          });

          await page.waitForTimeout(1500); // 1.5 seg resaltado

          // 2. Quitar el resaltado
          await btn.evaluate((node: HTMLElement) => {
            node.style.outline = 'none';
            node.style.transform = 'scale(1)';
          });
          await page.waitForTimeout(500);

          // 3. Clic
          await btn.click();

          // Esperar un momento para ver la descarga o la pestaña del PDF
          await page.waitForTimeout(3000);
        }
      }

      // Dejamos 70 segundos de pausa al final.
      // Esto te da tiempo de sobra para cerrar manualmente la ventana de impresión del PDF,
      // regresar a la pestaña principal de reportes y mostrarle al jurado cómo quedó el sistema.
      await page.waitForTimeout(7000);
    });
  });
});
