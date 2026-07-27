import { test, expect } from '@playwright/test';

test('Demostración de Seguridad y Roles', async ({ page, isMobile }) => {
  test.setTimeout(300000); // 5 minutos de timeout para la presentación

  const openMenuMobile = async () => {
    if (isMobile) {
      const menuBtn = page.getByRole('button', { name: /menú|menu/i }).first();
      if (await menuBtn.isVisible()) await menuBtn.click();
    }
  };

  await test.step('1. Prueba de Seguridad (Usuario con contraseña incorrecta)', async () => {
    await page.goto('/');

    // Pequeña pausa inicial para que el jurado vea la pantalla de login antes de que empiece a escribir
    await page.waitForTimeout(2000);

    // Llenamos el usuario y una contraseña incorrecta
    await page.getByPlaceholder(/correo|email|usuario/i).first().fill('usuario_falso@gmail.com');
    await page.getByPlaceholder(/contraseña|password/i).fill('claveIncorrecta');

    // Mostrar contraseña
    const showBtns = page.locator('button:has(svg.lucide-eye), button:has(svg.lucide-eye-off), button:has-text("contrase")');
    if (await showBtns.count() > 0) {
      await showBtns.first().click();
    }

    await page.waitForTimeout(1000); // Pausa breve para no verse tan forzado
    await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();

    // Verificamos que aparezca un mensaje de error y esperamos 3 segundos para que el jurado lo vea
    await expect(page.getByText(/error|incorrect|no coincide|credenciales/i).first()).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(3000);
  });

  await test.step('2. Prueba de Validación (Campos vacíos)', async () => {
    // Llenamos solo el usuario y dejamos la contraseña vacía
    await page.getByPlaceholder(/correo|email|usuario/i).first().fill('esteban9696e.c@gmail.com');
    await page.getByPlaceholder(/contraseña|password/i).fill('');

    // Pausa para explicar qué pasa si se envía vacío
    await page.waitForTimeout(4000); 
    await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();

    // Verificamos que aparezca un mensaje de error y esperamos 3 segundos para que el jurado lo vea
    await expect(page.getByText(/error|incorrect|requerid|complet|credenciales/i).first()).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(3000);
  });

  await test.step('3. Acceso Operativo y Cambio de Clave', async () => {
    await page.goto('/');

    // Pausa breve (reducida) para terminar de conectar la idea antes de ingresar el usuario
    await page.waitForTimeout(2000);

    await page.getByPlaceholder(/correo|email|usuario/i).first().fill('esteban9696e.c@gmail.com');
    await page.getByPlaceholder(/contraseña|password/i).fill('Usuario.123');

    // Mostrar contraseña para que el jurado vea la correcta
    const showBtnsLogin = page.locator('button:has(svg.lucide-eye), button:has(svg.lucide-eye-off), button:has-text("contrase")');
    if (await showBtnsLogin.count() > 0) {
      await showBtnsLogin.first().click();
      await page.waitForTimeout(4000); // Pausa para que vean la clave correcta
    }

    await page.waitForTimeout(1000); // Pausa breve para no verse tan forzado
    await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();

    // El operativo es redirigido a pedidos (o dashboard)
    await expect(page).toHaveURL(/.*(dashboard|pedidos).*/i, { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Ir a perfil (con resaltado visual para el jurado)
    await openMenuMobile();
    const btnPerfil = page.getByRole('link', { name: /mi perfil/i }).first();

    // Le ponemos un borde rojo llamativo y lo agrandamos un poco por 2 segundos antes de dar clic
    await btnPerfil.evaluate((node: HTMLElement) => {
      node.style.border = '4px solid red';
      node.style.backgroundColor = '#ffcccc';
      node.style.transition = 'all 0.3s';
      node.style.transform = 'scale(1.05)';
    });
    await page.waitForTimeout(2000);

    await btnPerfil.click();
    await expect(page).toHaveURL(/.*perfil.*/i);
    // Pausa Larga: Esperar 8 segundos para que puedas explicar los campos del perfil antes de cambiar la clave
    await page.waitForTimeout(8000);

    // Iniciar cambio de contraseña
    const btnCambiar = page.getByRole('button', { name: /cambiar contraseña|cambiar clave/i }).first();
    if (await btnCambiar.isVisible()) {
      await btnCambiar.click();
    } else {
      await page.getByText(/cambiar contraseña/i).click();
    }
    await page.waitForTimeout(1000);

    // Llenar contraseña actual
    await page.locator('#currentPassword').fill('Usuario.123');
    
    // 1. Mostrar validaciones en ROJO (Contraseña inválida)
    await page.locator('#password').fill('temp');
    await page.locator('#confirmPassword').fill('algo');

    // Mostrar las 3 contraseñas haciendo clic en los botones de "ver contraseña"
    const allShowBtns = page.locator('button:has(svg.lucide-eye), button:has(svg.lucide-eye-off), button:has-text("contrase")');
    const count = await allShowBtns.count();
    for (let i = 0; i < count; i++) {
      await allShowBtns.nth(i).click();
      await page.waitForTimeout(300);
    }

    // Esperar 5 segundos para que vean las X rojas
    await page.waitForTimeout(5000);
    
    // 2. Mostrar validaciones en VERDE (Contraseña válida)
    await page.locator('#password').fill('UsrO.123');
    await page.locator('#confirmPassword').fill('UsrO.123');

    // Esperar 8 segundos para que el jurado vea las contraseñas en verde y el botón activado
    await page.waitForTimeout(8000);

    // Cancelar
    const btnCancelar = page.getByRole('button', { name: /cancelar/i }).last();
    if (await btnCancelar.isVisible()) {
      await btnCancelar.click();
    }
    await page.waitForTimeout(1000);

    // Cerrar sesión de forma segura para no trabar la prueba
    await openMenuMobile();
    const btnLogout = page.locator('button:has-text("Cerrar Sesi"), button:has-text("cerrar sesi")').first();
    if (await btnLogout.isVisible()) {
      await btnLogout.click();
      await expect(page).toHaveURL(/.*login.*/i, { timeout: 5000 });
    } else {
      await page.context().clearCookies();
      await page.evaluate(() => window.localStorage.clear());
    }
    await page.waitForTimeout(1000);
  });

  await test.step('4. Gestión de Usuarios (Administrador)', async () => {
    // Forzar ir al login
    await page.goto('/');

    // Pausa Larga para que termines de explicar que se puede iniciar sesión solo con el nombre de usuario (adminecencia)
    await page.waitForTimeout(6000);

    await page.getByPlaceholder(/correo|email|usuario/i).first().fill('adminecencia');
    await page.getByPlaceholder(/contraseña|password/i).fill('Admin.123');

    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /entrar|iniciar|login/i }).click();

    await expect(page).toHaveURL(/.*dashboard.*/i, { timeout: 10000 });
    await page.waitForTimeout(2000);

    // Ir a Empleados/Usuarios
    await openMenuMobile();
    const linkEmpleados = page.getByRole('link', { name: /empleados|usuarios/i }).first();

    await linkEmpleados.evaluate((node: HTMLElement) => {
      node.style.border = '4px solid red';
      node.style.color = 'black';
      node.style.backgroundColor = 'white'; // Asegurar contraste o simplemente quitarlo
    });
    await page.waitForTimeout(1500);
    await linkEmpleados.click();

    await expect(page).toHaveURL(/.*(empleados|usuarios).*/i);

    // Pausa Larga: Esperar 12 segundos para que puedas explicar la tabla, nombres, roles y estados
    await page.waitForTimeout(12000);

    // Resaltar y dar clic en Editar al SEGUNDO empleado (Esteban Carvajal)
    const btnEditar = page.getByRole('button', { name: /editar/i }).nth(1);
    if (await btnEditar.isVisible()) {
      await btnEditar.evaluate((node: HTMLElement) => {
        node.style.border = '3px solid red';
        node.style.padding = '2px';
        node.style.borderRadius = '4px';
      });
      await page.waitForTimeout(2000); // Pausa de 2 segundos para que se note la acción
      await btnEditar.click();
    } else {
      await btnEditar.click();
    }

    // Esperar unos 6 segundos para ver los datos del empleado antes de interactuar
    await page.waitForTimeout(6000);

    // Resaltar y abrir el dropdown de roles (Operativo / Administrativo)
    const selectRol = page.locator('#edit-rol');
    if (await selectRol.isVisible()) {
      await selectRol.evaluate((node: HTMLElement) => {
        node.style.border = '3px solid red';
        node.style.transform = 'scale(1.02)';
      });
      await selectRol.click();
      await page.waitForTimeout(3000); // 3 segundos para que puedas explicar los dos roles disponibles
      
      // Quitar el resaltado y cerrar el select (haciendo clic afuera en el Label)
      await selectRol.evaluate((node: HTMLElement) => {
        node.style.border = '';
        node.style.transform = '';
      });
      await page.locator('text=Rol del Sistema').first().click();
      await page.waitForTimeout(1000);
    }

    // Resaltar botón de enviar enlace sin darle clic (para evitar errores de límite de Supabase)
    const btnEnviarEnlace = page.getByRole('button', { name: /enviar enlace/i }).first();
    if (await btnEnviarEnlace.isVisible()) {
      await btnEnviarEnlace.evaluate((node: HTMLElement) => {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        node.style.border = '3px solid red';
        node.style.transform = 'scale(1.05)';
      });
      // Solo aguantamos unos 3 segundos para que puedas decir "y aquí podríamos enviar el enlace"
      await page.waitForTimeout(3000);
    }

    // Botón de forzar cambio de contraseña (cambiar contraseña ahora)
    const btnForzarCambio = page.locator('button:has-text("Cambiar contrase")').first();
    if (await btnForzarCambio.isVisible()) {
      await btnForzarCambio.click();

      // Asegurarnos de desplazar la ventana del modal hasta el fondo para que se vean bien las contraseñas
      const modalCancel = page.getByRole('button', { name: /cancelar/i }).last();
      if (await modalCancel.isVisible()) {
        await modalCancel.evaluate((node) => node.scrollIntoView({ behavior: 'smooth', block: 'end' }));
      }

      // 1. Llenar contraseñas INCORRECTAS para mostrar las validaciones en rojo
      await page.waitForTimeout(1000);
      const inputs = page.locator('input[type="password"], input[type="text"]');
      if (await inputs.count() >= 2) {
        await inputs.nth(0).fill('temp'); // Sin mayúscula, sin número, sin especial, muy corta
        await inputs.nth(1).fill('algo'); // Diferente a la primera
      }
      
      // Mostrar las contraseñas incorrectas
      const showBtns = page.locator('button:has(svg.lucide-eye), button:has(svg.lucide-eye-off), button:has-text("contrase")');
      for (let i = 0; i < await showBtns.count(); i++) {
        await showBtns.nth(i).click();
      }

      // Esperar 4 segundos para que vean los textos en rojo y el botón deshabilitado
      await page.waitForTimeout(4000);

      // 2. Llenar contraseñas CORRECTAS para mostrar las validaciones en verde
      if (await inputs.count() >= 2) {
        await inputs.nth(0).fill('Temp.123');
        await inputs.nth(1).fill('Temp.123');
      }

      // Esperar 5 segundos para que vean que todo cambió a verde y el botón se activó
      await page.waitForTimeout(5000);

      // Cancelar el cambio de contraseña
      const btnCancelar = page.getByRole('button', { name: /cancelar/i }).last();
      if (await btnCancelar.isVisible()) {
        await btnCancelar.click();
      }
      await page.waitForTimeout(1000);
    }

    // Cerrar el modal principal del empleado para poder ver el botón de cerrar sesión
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Cerrar sesión al final del demo
    const btnLogoutAdmin = page.locator('button:has-text("Cerrar Sesi"), button:has-text("cerrar sesi")').first();
    if (await btnLogoutAdmin.isVisible()) {
      await btnLogoutAdmin.click();
      await expect(page).toHaveURL(/.*login.*/i, { timeout: 5000 });
    }
  });

  await test.step('5. Restablecer contraseña', async () => {
    // Asegurarnos de estar en el login
    await page.goto('/');
    await page.waitForTimeout(1000);

    // Clic en Olvidó su contraseña
    const btnOlvido = page.getByText(/¿Olvidó su contraseña\?/i).first();
    if (await btnOlvido.isVisible()) {
      // Un efecto visual sutil para que el jurado note dónde hacemos clic
      await btnOlvido.evaluate((node: HTMLElement) => {
        node.style.border = '2px solid red';
        node.style.padding = '2px';
        node.style.borderRadius = '4px';
      });
      await page.waitForTimeout(2000);
      await btnOlvido.click();
    }
    
    await page.waitForTimeout(1000);

    // Ingresar el correo del usuario operativo
    const inputCorreo = page.getByPlaceholder(/Ingrese su correo registrado/i).first();
    await inputCorreo.fill('esteban9696e.c@gmail.com');
    await page.waitForTimeout(2000); // Pausa para que el jurado vea qué correo se llenó

    // Clic en Enviar Enlace
    const btnEnviarEnlace = page.getByRole('button', { name: /enviar enlace/i }).first();
    if (await btnEnviarEnlace.isVisible()) {
      await btnEnviarEnlace.evaluate((node: HTMLElement) => {
          node.style.border = '3px solid red';
          node.style.transform = 'scale(1.05)';
      });
      await page.waitForTimeout(2000);
      await btnEnviarEnlace.click();
    }

    // Damos una pausa más corta (3 seg) antes de que la prueba termine y cierre el navegador.
    // Una vez que se cierre, puedes abrir el Gmail para mostrar la llegada del correo.
    await page.waitForTimeout(3000);
  });
});
