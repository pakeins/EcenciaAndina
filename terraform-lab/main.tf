terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id != "" ? var.subscription_id : null
}

# 1. Grupo de Recursos
resource "azurerm_resource_group" "rg" {
  name     = "rg-terraform-process"
  location = var.azure_region
  tags = {
    Environment = "Dev"
    Project     = "EcenciaAndina"
  }
}

# 2. Red Virtual (VNet)
resource "azurerm_virtual_network" "vnet" {
  name                = "vnet-terraform-process"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name

  tags = {
    Name        = "vnet-terraform-process"
    Environment = "Dev"
  }
}

# 3. Subred
resource "azurerm_subnet" "subnet" {
  name                 = "subnet-terraform-process"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = ["10.0.1.0/24"]
}

# 4. IP Pública (Estática y Estándar)
resource "azurerm_public_ip" "public_ip" {
  name                = "pip-terraform-process"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  allocation_method   = "Static"
  sku                 = "Standard"

  tags = {
    Name        = "pip-terraform-process"
    Environment = "Dev"
  }
}

# 5. Grupo de Seguridad de Red (NSG)
resource "azurerm_network_security_group" "nsg" {
  name                = "nsg-terraform-process"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name

  # Regla para HTTP (Puerto 80) obligatoria
  security_rule {
    name                       = "allow-http"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "80"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  # Regla para SSH (Puerto 22) - Necesaria para subir la tesis por SCP
  security_rule {
    name                       = "allow-ssh"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  tags = {
    Name        = "nsg-terraform-process"
    Environment = "Dev"
  }
}

# 6. Interfaz de Red (NIC)
resource "azurerm_network_interface" "nic" {
  name                = "nic-terraform-process"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.subnet.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.public_ip.id
  }

  tags = {
    Name        = "nic-terraform-process"
    Environment = "Dev"
  }
}

# 7. Asociación del NSG con la Tarjeta de Red
resource "azurerm_network_interface_security_group_association" "nic_nsg" {
  network_interface_id      = azurerm_network_interface.nic.id
  network_security_group_id = azurerm_network_security_group.nsg.id
}

# 8. Generación Dinámica de la Llave SSH
resource "tls_private_key" "ssh_key" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

# Guardar la clave privada localmente para conectarse vía SSH/SCP (se ignora en git)
resource "local_file" "private_key" {
  content         = tls_private_key.ssh_key.private_key_pem
  filename        = "${path.module}/id_rsa.pem"
  file_permission = "0600"
}

# 9. Máquina Virtual Linux (Ubuntu Server)
resource "azurerm_linux_virtual_machine" "vm" {
  name                = "vm-terraform-process"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  size                = var.tamano_vm
  admin_username      = "azureuser"

  network_interface_ids = [
    azurerm_network_interface.nic.id,
  ]

  admin_ssh_key {
    username   = "azureuser"
    public_key = tls_private_key.ssh_key.public_key_openssh
  }

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts"
    version   = "latest"
  }

  # Script de Automatización (custom_data) en Base64
  custom_data = base64encode(<<EOF
#!/bin/bash
# Detener temporalmente las actualizaciones automáticas desatendidas para evitar bloqueos de dpkg
systemctl stop unattended-upgrades || true

# Esperar a que se liberen todos los bloqueos de apt/dpkg
while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || fuser /var/lib/apt/lists/lock >/dev/null 2>&1 ; do
  echo "Esperando que otros procesos de actualización automáticos liberen el candado de apt..."
  sleep 5
done

# 1. Actualizar repositorios e instalar utilidades básicas
apt-get update -y
apt-get install -y apt-transport-https ca-certificates curl software-properties-common apache2



    # 2. Instalar Docker
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io

    # 3. Instalar Docker Compose v2 (como plugin)
    apt-get install -y docker-compose-plugin

    # 4. Configurar permisos de Docker para azureuser
    usermod -aG docker azureuser

    # 5. Habilitar módulos de Apache para proxy reverso y React Router
    a2enmod proxy
    a2enmod proxy_http
    a2enmod rewrite
    systemctl restart apache2

    # 6. Configurar el host virtual predeterminado de Apache con proxy reverso
    cat <<'APACHECONF' > /etc/apache2/sites-available/000-default.conf
    <VirtualHost *:80>
        ServerAdmin webmaster@localhost
        DocumentRoot /var/www/html

        # Proxy reverso para redirigir las peticiones /api al contenedor Docker (Node.js en puerto 3001)
        ProxyPreserveHost On
        ProxyPass /api http://localhost:3001/api
        ProxyPassReverse /api http://localhost:3001/api

        # Soporte para React Router (redirección a index.html si no es archivo físico)
        <Directory /var/www/html>
            Options Indexes FollowSymLinks
            AllowOverride All
            Require all granted

            RewriteEngine On
            RewriteBase /
            RewriteRule ^index\.html$ - [L]
            RewriteCond %%{REQUEST_FILENAME} !-f
            RewriteCond %%{REQUEST_FILENAME} !-d
            RewriteRule . /index.html [L]
        </Directory>

        ErrorLog $${APACHE_LOG_DIR}/error.log
        CustomLog $${APACHE_LOG_DIR}/access.log combined
    </VirtualHost>
APACHECONF

    # Reiniciar Apache para aplicar la configuración
    systemctl restart apache2

    # 7. Crear directorios de despliegue y asignar propiedad a azureuser
    mkdir -p /var/www/html
    chown -R azureuser:azureuser /var/www/html
    chmod -R 755 /var/www/html

    mkdir -p /home/azureuser/ECenciaAPP/convenios
    chown -R azureuser:azureuser /home/azureuser/ECenciaAPP
    chmod -R 755 /home/azureuser/ECenciaAPP

    # 8. Crear una Landing Page inicial de espera
    cat <<'HTML' > /var/www/html/index.html
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ecencia Andina - Portal del Proyecto y Tesis</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Plus+Jakarta+Sans:wght@300;400;600;700&display=swap" rel="stylesheet">
        <style>
            :root {
                --bg-primary: #0b0f19;
                --bg-secondary: #161c2d;
                --accent-primary: #3b82f6;
                --accent-secondary: #10b981;
                --text-main: #f3f4f6;
                --text-muted: #9ca3af;
                --border-color: rgba(255, 255, 255, 0.08);
            }

            * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }

            body {
                font-family: 'Plus Jakarta Sans', sans-serif;
                background-color: var(--bg-primary);
                color: var(--text-main);
                line-height: 1.6;
                overflow-x: hidden;
            }

            .background-glow {
                position: absolute;
                top: -20%;
                left: 20%;
                width: 600px;
                height: 600px;
                background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, rgba(16, 185, 129, 0.05) 50%, rgba(0,0,0,0) 100%);
                filter: blur(80px);
                z-index: -1;
            }

            .container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 2rem;
                position: relative;
            }

            header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 1.5rem 0;
                border-bottom: 1px solid var(--border-color);
                margin-bottom: 4rem;
            }

            .logo {
                font-family: 'Outfit', sans-serif;
                font-size: 1.8rem;
                font-weight: 800;
                background: linear-gradient(135deg, #3b82f6, #10b981);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .badge {
                font-size: 0.75rem;
                padding: 0.25rem 0.75rem;
                background: rgba(59, 130, 246, 0.1);
                border: 1px solid rgba(59, 130, 246, 0.2);
                border-radius: 9999px;
                color: var(--accent-primary);
                font-weight: 600;
            }

            .hero {
                text-align: center;
                max-width: 800px;
                margin: 0 auto 5rem auto;
            }

            .hero h1 {
                font-family: 'Outfit', sans-serif;
                font-size: 3.5rem;
                font-weight: 800;
                line-height: 1.2;
                margin-bottom: 1.5rem;
                background: linear-gradient(to right, #ffffff, #9ca3af);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }

            .hero p {
                font-size: 1.2rem;
                color: var(--text-muted);
                margin-bottom: 2rem;
            }

            .grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
                gap: 2rem;
                margin-bottom: 5rem;
            }

            .card {
                background-color: var(--bg-secondary);
                border: 1px solid var(--border-color);
                border-radius: 16px;
                padding: 2.5rem;
                position: relative;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                overflow: hidden;
            }

            .card::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 4px;
                background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
                opacity: 0;
                transition: opacity 0.3s ease;
            }

            .card:hover {
                transform: translateY(-8px);
                border-color: rgba(59, 130, 246, 0.3);
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2);
            }

            .card:hover::before {
                opacity: 1;
            }

            .card-title {
                font-family: 'Outfit', sans-serif;
                font-size: 1.5rem;
                font-weight: 700;
                margin-bottom: 1rem;
                display: flex;
                align-items: center;
                gap: 0.75rem;
            }

            .card-icon {
                font-size: 1.8rem;
            }

            .card-description {
                color: var(--text-muted);
                font-size: 1rem;
                margin-bottom: 2rem;
                flex-grow: 1;
            }

            .btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 0.8rem 1.5rem;
                border-radius: 8px;
                font-weight: 600;
                text-decoration: none;
                transition: all 0.2s ease;
                gap: 0.5rem;
                cursor: pointer;
            }

            .btn-primary {
                background: linear-gradient(135deg, #3b82f6, #2563eb);
                color: white;
                border: none;
                box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
            }

            .btn-primary:hover {
                background: linear-gradient(135deg, #2563eb, #1d4ed8);
                box-shadow: 0 6px 16px rgba(37, 99, 235, 0.3);
                transform: translateY(-1px);
            }

            .btn-secondary {
                background: rgba(255, 255, 255, 0.05);
                color: var(--text-main);
                border: 1px solid var(--border-color);
            }

            .btn-secondary:hover {
                background: rgba(255, 255, 255, 0.1);
                border-color: rgba(255, 255, 255, 0.2);
            }

            .btn-disabled {
                background: rgba(255, 255, 255, 0.02);
                color: var(--text-muted);
                border: 1px solid var(--border-color);
                cursor: not-allowed;
            }

            .status-badge {
                display: inline-flex;
                align-items: center;
                gap: 0.35rem;
                font-size: 0.8rem;
                font-weight: 600;
                margin-top: 1rem;
            }

            .status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
            }

            .status-green { color: #10b981; }
            .status-green .status-dot { background-color: #10b981; box-shadow: 0 0 8px #10b981; }
            .status-yellow { color: #f59e0b; }
            .status-yellow .status-dot { background-color: #f59e0b; box-shadow: 0 0 8px #f59e0b; }

            .infrastructure-details {
                background: rgba(22, 28, 45, 0.5);
                border: 1px solid var(--border-color);
                border-radius: 16px;
                padding: 2rem;
                margin-bottom: 4rem;
            }

            .infra-title {
                font-family: 'Outfit', sans-serif;
                font-size: 1.25rem;
                font-weight: 700;
                margin-bottom: 1.5rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .infra-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 1.5rem;
            }

            .infra-item {
                display: flex;
                flex-direction: column;
            }

            .infra-label {
                font-size: 0.8rem;
                color: var(--text-muted);
                text-transform: uppercase;
                letter-spacing: 0.05em;
                margin-bottom: 0.25rem;
            }

            .infra-value {
                font-size: 1rem;
                font-weight: 600;
            }

            footer {
                text-align: center;
                color: var(--text-muted);
                font-size: 0.9rem;
                padding: 3rem 0;
                border-top: 1px solid var(--border-color);
            }

            code {
                background: rgba(0,0,0,0.3);
                padding: 0.2rem 0.4rem;
                border-radius: 4px;
                font-family: monospace;
                color: #f43f5e;
                font-size: 0.9em;
            }
        </style>
    </head>
    <body>
        <div class="background-glow"></div>
        <div class="container">
            <header>
                <div class="logo">🌿 Ecencia Andina <span class="badge">PROYECTO DE TESIS</span></div>
                <div class="status-badge status-green">
                    <span class="status-dot"></span> Online
                </div>
            </header>

            <section class="hero">
                <h1>Servidor de Desarrollo Desplegado</h1>
                <p>Esta infraestructura ha sido automatizada usando <strong>Terraform</strong> y está lista para hospedar tu aplicación Dockerizada.</p>
            </section>

            <div class="grid">
                <!-- Tarjeta 1: Tesis PDF -->
                <div class="card">
                    <div>
                        <div class="card-title">
                            <span class="card-icon">📚</span> Tesis Escrita
                        </div>
                        <p class="card-description">Descarga o visualiza en línea el documento de grado correspondiente al proyecto "Ecencia Andina - Sistema de Gestión y Analítica de Consumos".</p>
                    </div>
                    <div>
                        <a id="btn-tesis" href="#" class="btn btn-disabled">Esperando archivo...</a>
                        <div id="status-tesis" class="status-badge status-yellow">
                            <span class="status-dot"></span> Pendiente de carga
                        </div>
                    </div>
                </div>

                <!-- Tarjeta 2: Manual de Marca -->
                <div class="card">
                    <div>
                        <div class="card-title">
                            <span class="card-icon">🎨</span> Manual de Marca
                        </div>
                        <p class="card-description">Revisa la identidad visual, paleta cromática, tipografías y el diseño gráfico conceptual del ecosistema de Ecencia Andina.</p>
                    </div>
                    <div>
                        <a id="btn-marca" href="#" class="btn btn-disabled">Esperando archivo...</a>
                        <div id="status-marca" class="status-badge status-yellow">
                            <span class="status-dot"></span> Pendiente de carga
                        </div>
                    </div>
                </div>

                <!-- Tarjeta 3: React Frontend Web App -->
                <div class="card">
                    <div>
                        <div class="card-title">
                            <span class="card-icon">💻</span> Aplicación Web (React)
                        </div>
                        <p class="card-description">Una vez compilado el cliente con <code>npm run build</code>, los archivos estáticos pueden ser subidos para reemplazar este portal de bienvenida.</p>
                    </div>
                    <div>
                        <div class="status-badge status-yellow">
                            <span class="status-dot"></span> Esperando archivos web
                        </div>
                    </div>
                </div>
            </div>

            <!-- Detalles de Infraestructura (Requerido para la tarea DevOps) -->
            <div class="infrastructure-details">
                <div class="infra-title">⚙️ Detalles de la Tarea DevOps (Terraform + Docker)</div>
                <div class="infra-grid">
                    <div class="infra-item">
                        <span class="infra-label">Servidor Web Host</span>
                        <span class="infra-value">Apache2 / Ubuntu 22.04</span>
                    </div>
                    <div class="infra-item">
                        <span class="infra-label">Contenedores</span>
                        <span class="infra-value">Docker & Docker Compose</span>
                    </div>
                    <div class="infra-item">
                        <span class="infra-label">Red Pública</span>
                        <span class="infra-value">Puerto 80 Abierto</span>
                    </div>
                    <div class="infra-item">
                        <span class="infra-label">Reverse Proxy</span>
                        <span class="infra-value">/api/ -> localhost:3001</span>
                    </div>
                </div>
            </div>

            <footer>
                <p>Ecencia Andina APP &copy; 2026 - Desarrollado bajo infraestructura como código (IaC)</p>
            </footer>
        </div>

        <script>
            // Verificar dinámicamente si los archivos PDF existen en el servidor
            function checkFile(url, buttonId, statusId, fileName, downloadName) {
                fetch(url, { method: 'HEAD' })
                    .then(response => {
                        if (response.ok) {
                            const btn = document.getElementById(buttonId);
                            btn.href = url;
                            btn.download = downloadName;
                            btn.innerText = "Descargar " + fileName;
                            btn.className = "btn btn-primary";

                            const status = document.getElementById(statusId);
                            status.className = "status-badge status-green";
                            status.innerHTML = '<span class="status-dot"></span> Listo para descarga';
                        }
                    })
                    .catch(error => console.log('Archivo no disponible: ' + fileName));
            }

            // Comprobar disponibilidad de PDF
            checkFile('/tesis.pdf', 'btn-tesis', 'status-tesis', 'Tesis (PDF)', 'Tesis_Ecencia_Andina.pdf');
            checkFile('/marca.pdf', 'btn-marca', 'status-marca', 'Manual (PDF)', 'Manual_Marca_Ecencia_Andina.pdf');
        </script>
    </body>
    </html>
    HTML
EOF
  )

  tags = {
    Environment = "Dev"
    Project     = "EcenciaAndina"
  }
}

# 10. Output: Dirección IP Pública asignada
output "direccion_ip_publica" {
  value       = azurerm_public_ip.public_ip.ip_address
  description = "Dirección IP pública asignada a la Máquina Virtual"
}
