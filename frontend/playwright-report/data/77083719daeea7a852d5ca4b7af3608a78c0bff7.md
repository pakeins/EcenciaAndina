# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: demo-step1.spec.ts >> Paso 1: Crear Cliente Frecuente y Asignar Saldo
- Location: tests\demo-step1.spec.ts:3:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/éxito|correctamente/i).first()
Expected: visible
Timeout: 8000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 8000ms
  - waiting for getByText(/éxito|correctamente/i).first()

```

```yaml
- region "Notifications alt+T"
- dialog "Nuevo Cliente":
  - heading "Nuevo Cliente" [level=2]
  - paragraph: Registre un nuevo cliente
  - text: Cédula *
  - textbox "Cédula *":
    - /placeholder: "Ej: 1712345678"
    - text: "1726359670"
  - text: Correo electrónico *
  - textbox "Correo electrónico *":
    - /placeholder: cliente@example.test
    - text: esteban9696@hotmail.com
  - text: Nombre *
  - textbox "Nombre *":
    - /placeholder: Nombre del cliente
    - text: Esteban
  - text: Apellido *
  - textbox "Apellido *":
    - /placeholder: Apellido del cliente
    - text: Carvajal
  - text: Teléfono
  - textbox "Teléfono":
    - /placeholder: "Ej: 0999999999"
    - text: "0998313804"
  - text: Tipo de Cliente
  - combobox: Frecuente
  - button "Cancelar"
  - button "Registrar Cliente"
  - button "Close":
    - img
    - text: Close
```

# Test source

```ts
  45  | 
  46  |   // Resaltar y dar clic en Nuevo Cliente
  47  |   const btnNuevo = page.getByRole('button', { name: /nuevo|crear|agregar/i }).first();
  48  |   if (await btnNuevo.isVisible()) {
  49  |     await btnNuevo.evaluate((node: HTMLElement) => {
  50  |       node.style.border = '3px solid red';
  51  |       node.style.transform = 'scale(1.05)';
  52  |       node.style.transition = 'all 0.2s';
  53  |     });
  54  |     await page.waitForTimeout(2000); // 2 segundos para ver a qué botón das clic
  55  |     await btnNuevo.click();
  56  |   } else {
  57  |     await btnNuevo.click();
  58  |   }
  59  |   
  60  |   // --- VALIDACIÓN 1: Cédula incorrecta ---
  61  |   await page.locator('#cedula').fill('9999999999'); // Cédula que falla el algoritmo de validación ecuatoriano
  62  |   await page.locator('#correo').fill('sup250@gmail.com'); // Correo repetido (duplicado)
  63  |   await page.locator('#nombre').fill('Esteban');
  64  |   await page.locator('#apellido').fill('Carvajal');
  65  |   
  66  |   const tipoSelect = page.getByRole('combobox').first();
  67  |   if (await tipoSelect.isVisible()) {
  68  |     await tipoSelect.click();
  69  |     await page.getByRole('option', { name: /frecuente/i }).first().click();
  70  |   }
  71  |   
  72  |   await page.locator('#telefono').fill('0998313804');
  73  |   
  74  |   // Pausa para que el jurado vea los campos llenados con el error
  75  |   await page.waitForTimeout(2000);
  76  |   
  77  |   await page.getByRole('button', { name: /registrar/i }).click();
  78  |   // Validamos que salte el toast de error de cédula
  79  |   await expect(page.getByText(/cedula valida|10 digitos/i).first()).toBeVisible({ timeout: 5000 });
  80  |   await page.waitForTimeout(3000); // Pausa para explicar la validación de cédula
  81  | 
  82  |   // --- VALIDACIÓN 2: Correo duplicado ---
  83  |   await page.locator('#cedula').fill('1726359670'); // Ponemos una cédula válida
  84  |   await page.waitForTimeout(2000);
  85  |   
  86  |   await page.getByRole('button', { name: /registrar/i }).click();
  87  |   // Validamos que salte el toast indicando que el correo ya existe
  88  |   await expect(page.getByText(/existe|correo|registrado/i).first()).toBeVisible({ timeout: 8000 });
  89  |   await page.waitForTimeout(3000); // Pausa para explicar la validación de correo duplicado
  90  | 
  91  |   // --- VALIDACIÓN 3: Teléfono duplicado ---
  92  |   await page.locator('#correo').fill('esteban9696@hotmail.com'); // Corregimos a correo válido y disponible
  93  |   await page.locator('#telefono').fill('0946517354'); // Ponemos un teléfono duplicado (el de Esteban Mosquera)
  94  |   await page.waitForTimeout(2000);
  95  |   
  96  |   await page.getByRole('button', { name: /registrar/i }).click();
  97  |   // Validamos que salte el toast indicando que el teléfono ya existe en el sistema
  98  |   await expect(page.getByText(/telefono|teléfono|existe|registrado/i).first()).toBeVisible({ timeout: 8000 });
  99  |   await page.waitForTimeout(3000); // Pausa para explicar la validación de teléfono duplicado
  100 | 
  101 |   // --- PREPARAR REGISTRO EXITOSO ---
  102 |   await page.locator('#telefono').fill('0998313804'); // Corregimos al teléfono disponible
  103 |   await page.waitForTimeout(2000);
  104 | 
  105 |   // Antes de registrar, abrimos y cerramos el select de "Tipo de Cliente" para mostrar que existen Frecuentes y Convenios
  106 |   const selectTipoCliente = page.getByRole('dialog').getByRole('combobox').first();
  107 |   if (await selectTipoCliente.isVisible()) {
  108 |     // 1. Hacer clic para abrir los tipos de clientes
  109 |     await selectTipoCliente.click();
  110 |     await page.waitForTimeout(1000);
  111 |     
  112 |     // 2. Seleccionar "Convenio" para habilitar la sección de empresas vinculadas
  113 |     await page.getByRole('option', { name: /convenio/i }).first().click();
  114 |     await page.waitForTimeout(2000); // Pausa para que se aprecie el cambio en el formulario
  115 |     
  116 |     // 3. Dar clic sobre el selector de convenios (empresas)
  117 |     const selectConvenio = page.locator('#convenio');
  118 |     if (await selectConvenio.isVisible()) {
  119 |       await selectConvenio.click();
  120 |       await page.waitForTimeout(2000); // Pausa de 2 segundos para que el jurado vea los convenios registrados
  121 |       await page.keyboard.press('Escape'); // Cerramos el desplegable de convenios
  122 |       await page.waitForTimeout(1000);
  123 |     }
  124 |     
  125 |     // 4. Regresar el Tipo de Cliente a "Frecuente" (el tipo que vamos a registrar)
  126 |     await selectTipoCliente.click();
  127 |     await page.waitForTimeout(1000);
  128 |     await page.getByRole('option', { name: /frecuente/i }).first().click();
  129 |     await page.waitForTimeout(1500);
  130 |   }
  131 | 
  132 |   // Resaltar botón de registrar final
  133 |   const btnRegistrarFinal = page.getByRole('dialog').getByRole('button', { name: /registrar|crear/i }).first();
  134 |   if (await btnRegistrarFinal.isVisible()) {
  135 |     await btnRegistrarFinal.evaluate((node: HTMLElement) => {
  136 |       node.style.border = '3px solid red';
  137 |       node.style.transform = 'scale(1.05)';
  138 |     });
  139 |     await page.waitForTimeout(2000);
  140 |     await btnRegistrarFinal.click();
  141 |   } else {
  142 |     await page.getByRole('button', { name: /registrar/i }).click();
  143 |   }
  144 |   
> 145 |   await expect(page.getByText(/éxito|correctamente/i).first()).toBeVisible({ timeout: 8000 });
      |                                                                ^ Error: expect(locator).toBeVisible() failed
  146 | 
  147 |   // Pausa de 8 segundos para que puedas explicar la creación exitosa del cliente
  148 |   await page.waitForTimeout(8000);
  149 | 
  150 |   // Si sale el dialog de "Telegram Onboarding" (o cualquier otro modal), lo cerramos con Escape
  151 |   await page.keyboard.press('Escape');
  152 |   await page.waitForTimeout(1000);
  153 | 
  154 |   // Asignar saldo inicial
  155 |   const btnRecarga = page.getByRole('button', { name: /recargar saldo/i }).first();
  156 |   await expect(btnRecarga).toBeVisible({ timeout: 5000 });
  157 |   await btnRecarga.click();
  158 |   
  159 |   await page.waitForTimeout(1000);
  160 |   
  161 |   // Llenar el modal de Recarga
  162 |   // 1. Número de Factura (Obligatorio)
  163 |   await page.getByPlaceholder(/ej: fac-0042/i).fill('FAC-001');
  164 | 
  165 |   // 2. Cliente
  166 |   const clientCombobox = page.getByRole('dialog').getByRole('combobox').nth(0);
  167 |   await clientCombobox.click();
  168 |   await page.getByRole('option', { name: /esteban/i }).click();
  169 | 
  170 |   // 3. Producto (Almuerzo Ejecutivo Sin Sopa)
  171 |   const productCombobox = page.getByRole('dialog').getByRole('combobox').nth(1);
  172 |   await productCombobox.click();
  173 |   await page.waitForTimeout(500);
  174 |   await page.getByRole('option', { name: /ejecutivo sin sopa/i }).first().click();
  175 |   
  176 |   // 4. Cantidad
  177 |   await page.getByRole('spinbutton').first().fill('20');
  178 |   
  179 |   // Pequeña pausa para que el jurado alcance a ver los datos de la recarga
  180 |   await page.waitForTimeout(2000);
  181 |   
  182 |   // Dar click en confirmar recarga
  183 |   await page.getByRole('dialog').getByRole('button', { name: /confirmar/i }).first().click();
  184 |   await expect(page.getByText(/éxito|actualizado/i)).toBeVisible({ timeout: 8000 });
  185 | });
  186 | 
```