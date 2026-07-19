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

  await openMenuMobile();
  await page.getByRole('link', { name: /menú diario/i }).click();
  
  const btnPublicarMenu = page.getByRole('button', { name: /publicar|notificar/i }).first();
  if (await btnPublicarMenu.isVisible()) {
    await btnPublicarMenu.click();
    await page.waitForTimeout(1000); 
  }
});
