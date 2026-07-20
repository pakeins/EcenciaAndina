import { test, expect } from '@playwright/test';

test('Paso 3: Crear Nuevo Pedido Manualmente', async ({ page, isMobile }) => {
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

  // 1. Nos vamos a la pestaña de pedidos
  await openMenuMobile();
  await page.getByRole('link', { name: /pedidos/i }).click();
  await expect(page).toHaveURL(/.*pedidos.*/i);
  
  // 2. Esperamos unos 5 segundos
  await page.waitForTimeout(5000);
  
  // 3. Resaltamos el boton de nuevo pedido y despues de 2 segundo damos clic
  const btnNuevoPedido = page.getByRole('button', { name: /nuevo pedido/i }).first();
  await expect(btnNuevoPedido).toBeVisible();
  await btnNuevoPedido.evaluate((node: HTMLElement) => {
    node.style.border = '3px solid red';
    node.style.transform = 'scale(1.05)';
    node.style.transition = 'all 0.2s';
  });
  await page.waitForTimeout(2000);
  await btnNuevoPedido.click();
  
  // 4. Esperamos que abra, damos 2 segundos
  const dialog = page.getByRole('dialog').first();
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(2000);
  
  // 5. Desplegamos el menu para seleccionar usuario.
  const clienteCombobox = dialog.getByRole('combobox').first();
  await clienteCombobox.click();
  await page.waitForTimeout(1000);
  
  // Escribimos el nombre usando el teclado (shadcn enfoca el input al abrir)
  await page.keyboard.type('Nancy');
  await page.waitForTimeout(1500); // Esperar que el filtro haga efecto
  
  // Resaltamos el usuario que vamos a seleccionar y 2 segundos despues lo seleccionamos
  // Buscamos la opción por "Nancy" (para evitar problemas con tildes como Landázuri)
  const optionUser = page.getByRole('option', { name: /nancy/i }).first();
  await expect(optionUser).toBeVisible({ timeout: 5000 });
  await optionUser.evaluate((node: HTMLElement) => {
    node.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
    node.style.borderLeft = '4px solid red';
  });
  await page.waitForTimeout(2000);
  await optionUser.click();
  
  // 6. Ahora se deplegara el nuevo menu.. ahi seleccionamos el almuerzo
  await page.waitForTimeout(2000); // Pausa más larga para asegurar que OrderFormFields cargue los productos
  
  // Buscamos específicamente el combobox que tiene el texto "Seleccionar almuerzo"
  const almuerzoCombobox = dialog.getByRole('combobox').filter({ hasText: /Seleccionar almuerzo/i }).first();
  await expect(almuerzoCombobox).toBeVisible({ timeout: 5000 });
  await almuerzoCombobox.click();
  
  // Damos más tiempo para que el jurado pueda leer todas las opciones de almuerzo disponibles
  await page.waitForTimeout(3500); 
  
  // Seleccionamos el almuerzo "Ejecutivo Completo" y lo resaltamos antes de hacer clic
  const optionAlmuerzo = page.getByRole('option', { name: /ejecutivo completo/i }).first();
  await expect(optionAlmuerzo).toBeVisible();
  await optionAlmuerzo.evaluate((node: HTMLElement) => {
    node.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
    node.style.borderLeft = '4px solid red';
  });
  await page.waitForTimeout(2000);
  await optionAlmuerzo.click();
  await page.waitForTimeout(2000); // Pausa para que aparezcan las opciones (Sopa, Segundo, etc)

  // 7. Luego vamos seleccionando cada una de las opciones que tenemos para ese almuerzo
  // Contamos cuántos combobox extras aparecieron (excluyendo cliente y almuerzo)
  // Nota: Buscamos dentro de una región específica si es necesario, pero dialog sirve
  const allCombos = dialog.getByRole('combobox');
  const combosCount = await allCombos.count();
  
  // Iteramos desde el índice 2 (ya que 0 es Cliente y 1 es Almuerzo)
  for (let i = 2; i < combosCount; i++) {
    const combo = allCombos.nth(i);
    // Verificamos si está habilitado y visible
    if (await combo.isVisible()) {
      await combo.click();
      await page.waitForTimeout(800);
      
      // La lista de opciones sale fuera del dialog (en el body), seleccionamos la primera válida
      // Descartamos la que dice "Otra opción..." si es la única, pero suele haber varias
      await page.getByRole('option').first().click();
      await page.waitForTimeout(800);
    }
  }

  // 8. Guardamos el almuerzo , damos unos 3 segundos
  const btnAgregar = dialog.getByRole('button', { name: /agregar producto/i });
  await btnAgregar.scrollIntoViewIfNeeded();
  await expect(btnAgregar).toBeVisible();
  await btnAgregar.evaluate((node: HTMLElement) => {
    node.style.border = '3px solid red';
    node.style.transform = 'scale(1.05)';
    node.style.transition = 'all 0.2s';
  });
  await page.waitForTimeout(2000); // Pausa para ver qué se va a presionar
  await btnAgregar.click();
  await page.waitForTimeout(3000);

  // 9. Y guardamos (Crear Pedido)
  const btnCrear = dialog.getByRole('button', { name: /crear pedido/i });
  await btnCrear.scrollIntoViewIfNeeded();
  await expect(btnCrear).toBeVisible();
  await btnCrear.evaluate((node: HTMLElement) => {
    node.style.border = '3px solid red';
    node.style.transform = 'scale(1.05)';
    node.style.transition = 'all 0.2s';
  });
  await page.waitForTimeout(2000); // Pausa para ver qué se va a presionar
  await btnCrear.click();
  
  // 10. Veremos la pantalla de pedidos y damos unos 6 segundos para mostrar que se creo el pedido
  await expect(page.getByText(/éxito|exitosamente/i)).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(6000);
});
