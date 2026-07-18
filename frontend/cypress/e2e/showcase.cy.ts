describe('Demostración para Defensa de Tesis - ECencia Andina', () => {
  
  beforeEach(() => {
    // Resetear viewport a tamaño de presentación
    cy.viewport(1280, 720);
  });

  it('Flujo E2E Completo: Login, Cliente, y Pedido', () => {
    // 1. Navegar a la página de inicio de sesión
    cy.visit('/');
    
    // Asumimos que la página inicial es el Login o redirige al Login
    // Llenar credenciales (deben ser válidas en tu BD local)
    // Buscamos los inputs por su tipo o placeholder. Adaptar si tus placeholders son diferentes.
    cy.get('input[type="email"]').type('admin@ecencia.com');
    cy.get('input[type="password"]').type('Admin123!'); // Reemplaza con una clave válida
    
    // Simular un poco de tiempo para que el jurado pueda leer
    cy.wait(1000); 
    cy.get('button[type="submit"]').click();

    // Validar que entramos exitosamente al Dashboard o página principal
    cy.url().should('not.include', '/login');
    cy.wait(2000); // Pausa dramática para mostrar el dashboard

    // 2. Demostrar el Módulo de Clientes (Navegación)
    cy.contains('Clientes').click();
    cy.wait(1500);
    
    // Buscar un cliente
    cy.get('input[placeholder*="Buscar"]').type('179'); // Búsqueda parcial de cédula o nombre
    cy.wait(1500);
    cy.get('input[placeholder*="Buscar"]').clear();

    // 3. Demostrar el Módulo de Caja (Pedidos)
    cy.contains('Caja').click();
    cy.wait(2000);

    // Seleccionar cliente en caja (asumiendo que hay un buscador de cliente o selector)
    cy.get('input[placeholder*="Buscar cliente"]').type('179');
    cy.wait(1000);
    cy.contains('Seleccionar').first().click(); // Ajusta según tu UI

    // Simular la selección de productos del menú
    cy.contains('Añadir').first().click(); // Añadir sopa
    cy.wait(500);
    cy.contains('Añadir').last().click();  // Añadir segundo
    cy.wait(1000);

    // Confirmar orden
    cy.contains('Confirmar Pedido').click();
    
    // Verificar que aparece el mensaje de éxito (Toast)
    cy.contains('creado con éxito', { matchCase: false }).should('be.visible');
    cy.wait(3000);

    // 4. Cerrar sesión
    cy.contains('Salir').click();
    cy.url().should('include', '/login');
  });

});
