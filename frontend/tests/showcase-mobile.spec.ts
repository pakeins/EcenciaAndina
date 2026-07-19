import { test, expect } from '@playwright/test';

test.describe('Demo Móvil - Responsividad', () => {

  test('Tour Rápido en Dispositivo Móvil', async ({ page }) => {
    // 1. Iniciar Sesión rápido
    await page.goto('/');
    await page.getByPlaceholder(/correo|email|usuario/i).first().fill('adminecencia');
    await page.getByPlaceholder(/contraseña|password/i).fill('Admin.123');
    await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();

    // 2. Dashboard
    await expect(page).toHaveURL(/.*dashboard.*/i, { timeout: 10000 });
    await page.waitForTimeout(2000);
    await page.mouse.wheel(0, 500); // Mostrar que hace scroll
    await page.waitForTimeout(1000);

    // Función para abrir menú móvil
    const openMenuMobile = async () => {
      const menuBtn = page.getByRole('button', { name: /menú|menu/i }).first();
      if (await menuBtn.isVisible()) {
        await menuBtn.click();
        await page.waitForTimeout(500); // Esperar animación
      }
    };

    // 3. Menú Diario (Ver diseño en cartas)
    await openMenuMobile();
    await page.getByRole('link', { name: /menú diario/i }).click();
    await page.waitForTimeout(1500);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(1000);

    // 4. Clientes
    await openMenuMobile();
    await page.getByRole('link', { name: /clientes/i }).click();
    await page.waitForTimeout(2000);
    
    // 5. Productos
    await openMenuMobile();
    await page.getByRole('link', { name: /productos/i }).click();
    await page.waitForTimeout(2000);
    
    // Y listo. Algo rápido solo para demostrar que todo se adapta a la pantalla.
  });
});
