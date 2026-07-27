import { test, expect } from '@playwright/test';

test('Paso 3: Marcar Pedido como Consumido', async ({ page, isMobile }) => {
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
  await page.getByRole('link', { name: /pedidos/i }).click();
  
  // Buscamos el primer pedido de la lista
  const orderRow = page.locator('tr').nth(1);
  
  if (await orderRow.isVisible()) {
    const btnEditarPedido = orderRow.getByRole('button', { name: /editar/i }).first();
    if (await btnEditarPedido.isVisible()) {
       await btnEditarPedido.click();
       
       await page.waitForTimeout(1000);
       const estadoCombobox = page.getByRole('combobox').last();
       if (await estadoCombobox.isVisible()) {
          await estadoCombobox.click();
          await page.getByRole('option', { name: /consumido/i }).click();
       }
       
       await page.getByRole('button', { name: /guardar|actualizar/i }).first().click();
       // Pequeña espera para que se vea el cambio antes de que se cierre
       await page.waitForTimeout(2000);
    }
  }
});
