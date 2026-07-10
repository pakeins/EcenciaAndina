import re
with open('c:/Users/esteb/Documents/TESIS/EcenciaAPP/.github/workflows/main.yml', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix gitleaks continue-on-error
content = content.replace('''      - name: Gitleaks Scan
        uses: gitleaks/gitleaks-action@v2
        continue-on-error: true
        env:''', '''      - name: Gitleaks Scan
        uses: gitleaks/gitleaks-action@v2
        env:''')

# Backend Tests
content = re.sub(
    r'      - name: Skip Backend Tests for fast deployment\n        run: echo "Backend tests temporarily disabled for fast deployment"\n      # TODO: Para restaurar las pruebas del backend, borra el \'Skip Backend Tests\' de arriba y descomenta lo siguiente:\n(?:      #.*\n)+',
    lambda m: m.group(0).replace('      - name: Skip Backend Tests for fast deployment\n        run: echo "Backend tests temporarily disabled for fast deployment"\n      # TODO: Para restaurar las pruebas del backend, borra el \'Skip Backend Tests\' de arriba y descomenta lo siguiente:\n', '').replace('      # ', '      - ').replace('      #', '      '),
    content
)

# Frontend Tests
content = re.sub(
    r'      - name: Skip Frontend Tests for fast deployment\n        run: echo "Frontend tests temporarily disabled for fast deployment"\n      # TODO: Para restaurar las pruebas del frontend, borra el \'Skip Frontend Tests\' de arriba y descomenta lo siguiente:\n(?:      #.*\n)+',
    lambda m: m.group(0).replace('      - name: Skip Frontend Tests for fast deployment\n        run: echo "Frontend tests temporarily disabled for fast deployment"\n      # TODO: Para restaurar las pruebas del frontend, borra el \'Skip Frontend Tests\' de arriba y descomenta lo siguiente:\n', '').replace('      # ', '      - ').replace('      #', '      '),
    content
)

# SonarCloud
content = re.sub(
    r'      - name: SonarQube Cloud scan\n        run: echo "SonarCloud scan temporarily disabled for fast deployment"\n      # TODO: Para restaurar SonarCloud, borra el \'SonarQube Cloud scan\' de arriba y descomenta lo siguiente:\n(?:      #.*\n)+',
    lambda m: m.group(0).replace('      - name: SonarQube Cloud scan\n        run: echo "SonarCloud scan temporarily disabled for fast deployment"\n      # TODO: Para restaurar SonarCloud, borra el \'SonarQube Cloud scan\' de arriba y descomenta lo siguiente:\n', '').replace('      # ', '      - ').replace('      #', '      '),
    content
)

# Integration Tests
content = re.sub(
    r'      - name: Skip Integration Tests for fast deployment\n        run: echo "Integration tests temporarily disabled for fast deployment"\n      # TODO: Para restaurar las pruebas de integracion, borra el \'Skip Integration Tests\' de arriba y descomenta lo siguiente:\n(?:      #.*\n)+',
    lambda m: m.group(0).replace('      - name: Skip Integration Tests for fast deployment\n        run: echo "Integration tests temporarily disabled for fast deployment"\n      # TODO: Para restaurar las pruebas de integracion, borra el \'Skip Integration Tests\' de arriba y descomenta lo siguiente:\n', '').replace('      # ', '      - ').replace('      #', '      '),
    content
)

# ZAP
content = re.sub(
    r'      - name: Skip ZAP for fast deployment\n        run: echo "OWASP ZAP tests temporarily disabled for fast deployment"\n      # TODO: Para restaurar los analisis de OWASP ZAP, borra el \'Skip ZAP\' de arriba y descomenta todo lo siguiente:\n(?:      #.*\n)+',
    lambda m: m.group(0).replace('      - name: Skip ZAP for fast deployment\n        run: echo "OWASP ZAP tests temporarily disabled for fast deployment"\n      # TODO: Para restaurar los analisis de OWASP ZAP, borra el \'Skip ZAP\' de arriba y descomenta todo lo siguiente:\n', '').replace('      # ', '      - ').replace('      #', '      '),
    content
)

with open('c:/Users/esteb/Documents/TESIS/EcenciaAPP/.github/workflows/main.yml', 'w', encoding='utf-8') as f:
    f.write(content)
