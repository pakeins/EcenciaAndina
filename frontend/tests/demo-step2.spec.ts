import { test, expect } from '@playwright/test';

test('Paso 2: Publicar Menú Diario', async ({ page, isMobile }) => {
  // Login como Admin
  await page.goto('/');
  await page.getByPlaceholder(/correo|email|usuario/i).first().fill('adminecencia');
  await page.getByPlaceholder(/contraseña|password/i).fill('Admin.123');
  await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();
  await expect(page).toHaveURL(/.*dashboard.*/i, { timeout: 10000 });

  const openMenuMobile = async () => {
    if (isMobile) {
      const menuBtn = page.getByRole('button', { name: /menú|menu/i }).first();
      if (await menuBtn.isVisible()) await menuBtn.click();
    }
  };

  // 1. Pausa inicial al entrar al dashboard antes de ir al menú
  await page.waitForTimeout(3000);
  
  await openMenuMobile();
  await page.getByRole('link', { name: /menú diario/i }).click();
  await expect(page).toHaveURL(/.*menu.*/i);

  // 2. Pausa para mostrar la interfaz del menú diario
  await page.waitForTimeout(4000);
  
  // 3. Demostramos cómo se seleccionan los platos desplegando algunos menús
  const allCombos = page.getByRole('combobox');
  const countCombos = await allCombos.count();
  
  if (countCombos > 0) {
    // Abrimos el primer combo (ej. Sopas)
    const combo1 = allCombos.nth(0);
    await combo1.scrollIntoViewIfNeeded();
    await combo1.evaluate((node: HTMLElement) => {
      node.style.border = '3px solid red';
      node.style.transition = 'all 0.3s';
    });
    await page.waitForTimeout(1000); // Pausa antes de abrir para que vean el resalte
    await combo1.click();
    await page.waitForTimeout(2500); // Pausa para que el jurado vea las opciones desplegadas
    await page.keyboard.press('Escape'); // Cerramos el menú sin modificar lo actual
    await page.waitForTimeout(1000);
  }

  if (countCombos > 1) {
    // Abrimos el segundo combo (ej. Platos Fuertes)
    const combo2 = allCombos.nth(1);
    await combo2.scrollIntoViewIfNeeded();
    await combo2.evaluate((node: HTMLElement) => {
      node.style.border = '3px solid red';
      node.style.transition = 'all 0.3s';
    });
    await page.waitForTimeout(1000);
    await combo2.click();
    await page.waitForTimeout(2500); // Pausa para ver las opciones
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
  }
  
  // 4. Buscamos el botón de publicar/notificar (que se llama "ENVIAR MENÚ")
  const btnPublicarMenu = page.getByRole('button', { name: /enviar menú/i }).first();
  
  if (await btnPublicarMenu.isVisible()) {
    // 4. Hacemos solo el scroll primero, y hacemos una pausa para que el jurado vea a dónde bajamos
    await btnPublicarMenu.evaluate((node: HTMLElement) => {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await page.waitForTimeout(2000); // Pausa de 2s viendo la pantalla luego del scroll

    // 5. Ahora resaltamos el botón fuertemente
    await btnPublicarMenu.evaluate((node: HTMLElement) => {
      node.style.border = '4px solid red';
      node.style.transform = 'scale(1.15)';
      node.style.transition = 'all 0.4s ease-out';
      node.style.boxShadow = '0 0 30px rgba(255, 0, 0, 0.6)';
    });
    
    // 6. Pausa de 3 segundos con el botón resaltado antes de dar el clic fatal
    await page.waitForTimeout(3000);
    await btnPublicarMenu.click();
    
    // 7. Esperar confirmación de éxito y pausar para que se vea el resultado
    await expect(page.getByText(/éxito|notificado|enviado/i)).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(6000);
  } else {
    // Si no está visible el botón, igual esperamos un poco antes de salir
    await page.waitForTimeout(3000);
  }
});
