import { test, expect } from '@playwright/test';

test.describe('Prueba Automatizada E2E - Tribunal', () => {

  test('Flujo Completo (Roles, Cliente, Menú, Pedidos)', async ({ page, isMobile }) => {
    // --------------------------------------------------------
    // ACTO 1: SEGURIDAD Y ROLES
    // --------------------------------------------------------
    await test.step('Login Incorrecto (Manejo de errores)', async () => {
      await page.goto('/');
      await page.getByPlaceholder(/correo|email|usuario/i).first().fill('usuario_falso@gmail.com');
      await page.getByPlaceholder(/contraseña|password/i).fill('claveIncorrecta');
      await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();
      // Validamos que aparezca algún mensaje de error
      await expect(page.getByText(/error|incorrect|no coincide|credenciales/i).first()).toBeVisible({ timeout: 5000 });
    });

    const openMenuMobile = async () => {
      if (isMobile) {
        const menuBtn = page.getByRole('button', { name: /menú|menu/i }).first();
        if (await menuBtn.isVisible()) await menuBtn.click();
      }
    };

    await test.step('Login como Usuario Operativo y Verificación de Perfil', async () => {
      await page.getByPlaceholder(/correo|email|usuario/i).first().fill('esteban9696e.c@gmail.com');
      await page.getByPlaceholder(/contraseña|password/i).fill('Usuario.123');
      await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();
      await expect(page).toHaveURL(/.*(dashboard|pedidos).*/i, { timeout: 10000 });

      // Ver perfil
      await openMenuMobile();
      await page.getByRole('link', { name: /mi perfil/i }).first().click();
      await expect(page).toHaveURL(/.*perfil.*/i);
      
      // Cerrar sesión
      await openMenuMobile();
      await page.getByRole('button', { name: /cerrar sesión/i }).first().click();
      await expect(page).toHaveURL(/.*login.*/i);
    });

    await test.step('Login como Administrador', async () => {
      await page.getByPlaceholder(/correo|email|usuario/i).first().fill('adminecencia');
      await page.getByPlaceholder(/contraseña|password/i).fill('Admin.123');
      await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();
      await expect(page).toHaveURL(/.*dashboard.*/i, { timeout: 10000 });
    });

    // --------------------------------------------------------
    // ACTO 2: CREACIÓN DE CLIENTE FRECUENTE
    // --------------------------------------------------------
    await test.step('Crear un Cliente Frecuente', async () => {
      await openMenuMobile();
      await page.getByRole('link', { name: /clientes/i }).click();
      await expect(page).toHaveURL(/.*clientes.*/i);

      await page.getByRole('button', { name: /nuevo|crear|agregar/i }).first().click();
      await page.getByPlaceholder(/cédula|cedula/i).fill('1726359670');
      await page.getByPlaceholder(/nombre/i).first().fill('Esteban Carvajal');
      
      // Seleccionar Frecuente
      const tipoSelect = page.getByRole('combobox').first();
      if (await tipoSelect.isVisible()) {
        await tipoSelect.click();
        await page.getByRole('option', { name: /frecuente/i }).first().click();
      }
      
      await page.getByPlaceholder(/teléfono|celular/i).fill('0998313804');
      await page.getByPlaceholder(/email|correo/i).last().fill('esteban9696@hotmail.com');
      
      await page.getByRole('button', { name: /guardar|crear|confirmar/i }).click();
      await expect(page.getByText(/éxito|correctamente/i)).toBeVisible({ timeout: 8000 });
    });

    await test.step('Asignar saldo inicial al Cliente', async () => {
      // Damos click en Recargar Saldo del primer cliente (el recién creado)
      const btnRecarga = page.getByRole('button', { name: /recargar saldo/i }).first();
      await expect(btnRecarga).toBeVisible();
      await btnRecarga.click();
      
      await page.getByRole('spinbutton').first().fill('20');
      await page.getByRole('button', { name: /recargar/i }).first().click();
      await expect(page.getByText(/éxito|actualizado/i)).toBeVisible({ timeout: 8000 });
    });

    // --------------------------------------------------------
    // ACTO 3: MENÚ DIARIO
    // --------------------------------------------------------
    await test.step('Publicar Menú Diario', async () => {
      await openMenuMobile();
      await page.getByRole('link', { name: /menú diario/i }).click();
      
      const btnPublicarMenu = page.getByRole('button', { name: /publicar|notificar/i }).first();
      if (await btnPublicarMenu.isVisible()) {
        await btnPublicarMenu.click();
        // Solo un pequeño timeout para dejar que la acción se registre en video
        await page.waitForTimeout(1000); 
      }
    });

    // --------------------------------------------------------
    // ACTO 4: PEDIDOS
    // --------------------------------------------------------
    await test.step('Cambiar estado de pedido a Consumido', async () => {
      await openMenuMobile();
      await page.getByRole('link', { name: /pedidos/i }).click();
      
      // Buscamos el primer pedido de la lista
      const orderRow = page.locator('tr').nth(1);
      
      // Para evitar que el test falle si no hay pedidos (porque depende de Telegram),
      // solo lo ejecutamos si hay al menos una fila visible
      if (await orderRow.isVisible()) {
        const btnEditarPedido = orderRow.getByRole('button', { name: /editar/i }).first();
        if (await btnEditarPedido.isVisible()) {
           await btnEditarPedido.click();
           
           const estadoCombobox = page.getByRole('combobox').last();
           if (await estadoCombobox.isVisible()) {
              await estadoCombobox.click();
              await page.getByRole('option', { name: /consumido/i }).click();
           }
           
           await page.getByRole('button', { name: /guardar|actualizar/i }).first().click();
        }
      }
    });

  });
});
