import { test, expect } from '@playwright/test';

test('Paso 1: Crear Cliente Frecuente y Asignar Saldo', async ({ page, isMobile }) => {
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
  await page.getByRole('link', { name: /clientes/i }).click();
  await expect(page).toHaveURL(/.*clientes.*/i);

  // Crear Cliente
  await page.getByRole('button', { name: /nuevo|crear|agregar/i }).first().click();
  
  // Llenar el formulario con los locators correctos
  await page.getByPlaceholder(/cédula|cedula/i).fill('1726359670');
  await page.getByPlaceholder(/cliente@/i).fill('esteban9696@hotmail.com'); // Correo
  await page.getByPlaceholder(/nombre del cliente/i).fill('Esteban');
  await page.getByPlaceholder(/apellido del cliente/i).fill('Carvajal');
  
  const tipoSelect = page.getByRole('combobox').first();
  if (await tipoSelect.isVisible()) {
    await tipoSelect.click();
    await page.getByRole('option', { name: /frecuente/i }).first().click();
  }
  
  await page.getByPlaceholder(/Ej: 099/i).fill('0998313804'); // Teléfono
  
  // Pequeña pausa para que el jurado alcance a ver los datos llenos
  await page.waitForTimeout(2000);
  
  await page.getByRole('button', { name: /registrar/i }).click();
  await expect(page.getByText(/éxito|correctamente/i)).toBeVisible({ timeout: 8000 });

  // Pausa de 4 segundos para que el jurado pueda ver la ventana emergente de Telegram
  await page.waitForTimeout(4000);

  // Si sale el dialog de "Telegram Onboarding" (o cualquier otro modal), lo cerramos con Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Asignar saldo inicial
  const btnRecarga = page.getByRole('button', { name: /recargar saldo/i }).first();
  await expect(btnRecarga).toBeVisible({ timeout: 5000 });
  await btnRecarga.click();
  
  await page.waitForTimeout(1000);
  
  // Llenar el modal de Recarga
  // 1. Número de Factura (Obligatorio)
  await page.getByPlaceholder(/ej: fac-0042/i).fill('FAC-001');

  // 2. Cliente
  const clientCombobox = page.getByRole('dialog').getByRole('combobox').nth(0);
  await clientCombobox.click();
  await page.getByRole('option', { name: /esteban/i }).click();

  // 3. Producto (Almuerzo Ejecutivo Completo)
  const productCombobox = page.getByRole('dialog').getByRole('combobox').nth(1);
  await productCombobox.click();
  await page.waitForTimeout(500);
  await page.getByRole('option', { name: /ejecutivo completo/i }).first().click();
  
  // 4. Cantidad
  await page.getByRole('spinbutton').first().fill('20');
  
  // Pequeña pausa para que el jurado alcance a ver los datos de la recarga
  await page.waitForTimeout(2000);
  
  // Dar click en confirmar recarga
  await page.getByRole('dialog').getByRole('button', { name: /confirmar/i }).first().click();
  await expect(page.getByText(/éxito|actualizado/i)).toBeVisible({ timeout: 8000 });
});
