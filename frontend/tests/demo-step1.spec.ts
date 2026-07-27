import { test, expect } from '@playwright/test';

test('Paso 1: Crear Cliente Frecuente y Asignar Saldo', async ({ page, isMobile }) => {
  test.setTimeout(180000); // 3 minutos de timeout para la demo
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

  // --- PREPARACIÓN: Borrar cliente 'Esteban' si ya existe para que la prueba sea repetible ---
  const inputBuscar = page.getByPlaceholder(/nombre, cédula, teléfono/i).first();
  if (await inputBuscar.isVisible()) {
    await inputBuscar.fill('1726359670'); // Buscar por cédula directamente
    await page.waitForTimeout(2000);

    const btnEliminar = page.getByRole('button', { name: /eliminar cliente/i }).first();
    if (await btnEliminar.isVisible()) {
      await btnEliminar.click();
      await page.waitForTimeout(1000);
      
      const btnBorradoForzado = page.getByRole('button', { name: /Borrado Forzado Permanentemente/i }).first();
      if (await btnBorradoForzado.isVisible()) {
        await btnBorradoForzado.click();
        // Esperar a que se elimine correctamente
        await expect(page.getByText(/eliminado correctamente/i).first()).toBeVisible({ timeout: 5000 });
        await page.waitForTimeout(2000);
      }
    }
    await inputBuscar.fill('');
    await page.waitForTimeout(1000);
  }

  // Resaltar y dar clic en Nuevo Cliente
  const btnNuevo = page.getByRole('button', { name: /nuevo|crear|agregar/i }).first();
  if (await btnNuevo.isVisible()) {
    await btnNuevo.evaluate((node: HTMLElement) => {
      node.style.border = '3px solid red';
      node.style.transform = 'scale(1.05)';
      node.style.transition = 'all 0.2s';
    });
    await page.waitForTimeout(2000); // 2 segundos para ver a qué botón das clic
    await btnNuevo.click();
  } else {
    await btnNuevo.click();
  }
  
  // --- VALIDACIÓN 1: Cédula incorrecta ---
  await page.locator('#cedula').fill('9999999999'); // Cédula que falla el algoritmo de validación ecuatoriano
  await page.locator('#correo').fill('sup250@gmail.com'); // Correo repetido (duplicado)
  await page.locator('#nombre').fill('Esteban');
  await page.locator('#apellido').fill('Carvajal');
  
  const tipoSelect = page.getByRole('combobox').first();
  if (await tipoSelect.isVisible()) {
    await tipoSelect.click();
    await page.getByRole('option', { name: /frecuente/i }).first().click();
  }
  
  await page.locator('#telefono').fill('0998313804');
  
  // Pausa para que el jurado vea los campos llenados con el error
  await page.waitForTimeout(2000);
  
  await page.getByRole('button', { name: /registrar/i }).click();
  // Validamos que salte el toast de error de cédula
  await expect(page.getByText(/cedula valida|10 digitos/i).first()).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(3000); // Pausa para explicar la validación de cédula

  // --- VALIDACIÓN 2: Correo duplicado ---
  await page.locator('#cedula').fill('1726359670'); // Ponemos una cédula válida
  await page.waitForTimeout(2000);
  
  await page.getByRole('button', { name: /registrar/i }).click();
  // Validamos que salte el toast indicando que el correo ya existe
  await expect(page.getByText(/existe|correo|registrado/i).first()).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(3000); // Pausa para explicar la validación de correo duplicado

  // --- VALIDACIÓN 3: Teléfono duplicado ---
  await page.locator('#correo').fill('esteban9696@hotmail.com'); // Corregimos a correo válido y disponible
  await page.locator('#telefono').fill('0946517354'); // Ponemos un teléfono duplicado (el de Esteban Mosquera)
  await page.waitForTimeout(2000);
  
  await page.getByRole('button', { name: /registrar/i }).click();
  // Validamos que salte el toast indicando que el teléfono ya existe en el sistema
  await expect(page.getByText(/telefono|teléfono|existe|registrado/i).first()).toBeVisible({ timeout: 8000 });
  await page.waitForTimeout(3000); // Pausa para explicar la validación de teléfono duplicado

  // --- PREPARAR REGISTRO EXITOSO ---
  await page.locator('#telefono').fill('0998313804'); // Corregimos al teléfono disponible
  await page.waitForTimeout(2000);

  // Antes de registrar, abrimos y cerramos el select de "Tipo de Cliente" para mostrar que existen Frecuentes y Convenios
  const selectTipoCliente = page.getByRole('dialog').getByRole('combobox').first();
  if (await selectTipoCliente.isVisible()) {
    // 1. Hacer clic para abrir los tipos de clientes
    await selectTipoCliente.click();
    await page.waitForTimeout(1000);
    
    // 2. Seleccionar "Convenio" para habilitar la sección de empresas vinculadas
    await page.getByRole('option', { name: /convenio/i }).first().click();
    await page.waitForTimeout(2000); // Pausa para que se aprecie el cambio en el formulario
    
    // 3. Dar clic sobre el selector de convenios (empresas)
    const selectConvenio = page.locator('#convenio');
    if (await selectConvenio.isVisible()) {
      await selectConvenio.click();
      await page.waitForTimeout(2000); // Pausa de 2 segundos para que el jurado vea los convenios registrados
      await page.keyboard.press('Escape'); // Cerramos el desplegable de convenios
      await page.waitForTimeout(1000);
    }
    
    // 4. Regresar el Tipo de Cliente a "Frecuente" (el tipo que vamos a registrar)
    await selectTipoCliente.click();
    await page.waitForTimeout(1000);
    await page.getByRole('option', { name: /frecuente/i }).first().click();
    await page.waitForTimeout(1500);
  }

  // Resaltar botón de registrar final
  const btnRegistrarFinal = page.getByRole('dialog').getByRole('button', { name: /registrar|crear/i }).first();
  if (await btnRegistrarFinal.isVisible()) {
    await btnRegistrarFinal.evaluate((node: HTMLElement) => {
      node.style.border = '3px solid red';
      node.style.transform = 'scale(1.05)';
    });
    await page.waitForTimeout(2000);
    await btnRegistrarFinal.click();
  } else {
    await page.getByRole('button', { name: /registrar/i }).click();
  }
  
  await expect(page.getByText(/éxito|correctamente/i).first()).toBeVisible({ timeout: 8000 });

  // Pausa de 8 segundos para que puedas explicar la creación exitosa del cliente
  await page.waitForTimeout(8000);

  // Si sale el dialog de "Telegram Onboarding" (o cualquier otro modal), lo cerramos con Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);

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

  // 3. Producto (Almuerzo Ejecutivo Sin Sopa)
  const productCombobox = page.getByRole('dialog').getByRole('combobox').nth(1);
  await productCombobox.click();
  await page.waitForTimeout(500);
  await page.getByRole('option', { name: /ejecutivo sin sopa/i }).first().click();
  
  // 4. Cantidad
  await page.getByRole('spinbutton').first().fill('20');
  
  // Pequeña pausa para que el jurado alcance a ver los datos de la recarga
  await page.waitForTimeout(2000);
  
  // Dar click en confirmar recarga
  await page.getByRole('dialog').getByRole('button', { name: /confirmar/i }).first().click();
  await expect(page.getByText(/éxito|actualizado/i)).toBeVisible({ timeout: 8000 });
});
