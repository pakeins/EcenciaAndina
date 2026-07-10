const fs = require('fs');
let content = fs.readFileSync('c:/Users/esteb/Documents/TESIS/EcenciaAPP/.github/workflows/main.yml', 'utf8');

// Normalize line endings for regex
content = content.replace(/\r\n/g, '\n');

// Fix gitleaks
content = content.replace(`      - name: Gitleaks Scan
        uses: gitleaks/gitleaks-action@v2
        continue-on-error: true
        env:`, `      - name: Gitleaks Scan
        uses: gitleaks/gitleaks-action@v2
        env:`);

// Backend Tests
content = content.replace(
  /      - name: Skip Backend Tests for fast deployment\n        run: echo "Backend tests temporarily disabled for fast deployment"\n      # TODO: Para restaurar las pruebas del backend, borra el 'Skip Backend Tests' de arriba y descomenta lo siguiente:\n(?:      #.*\n)+/,
  (match) => match
    .replace(`      - name: Skip Backend Tests for fast deployment\n        run: echo "Backend tests temporarily disabled for fast deployment"\n      # TODO: Para restaurar las pruebas del backend, borra el 'Skip Backend Tests' de arriba y descomenta lo siguiente:\n`, '')
    .replace(/      # -/g, '      -')
    .replace(/      # /g, '      ')
    .replace(/      #/g, '      ')
);

// Frontend Tests
content = content.replace(
  /      - name: Skip Frontend Tests for fast deployment\n        run: echo "Frontend tests temporarily disabled for fast deployment"\n      # TODO: Para restaurar las pruebas del frontend, borra el 'Skip Frontend Tests' de arriba y descomenta lo siguiente:\n(?:      #.*\n)+/,
  (match) => match
    .replace(`      - name: Skip Frontend Tests for fast deployment\n        run: echo "Frontend tests temporarily disabled for fast deployment"\n      # TODO: Para restaurar las pruebas del frontend, borra el 'Skip Frontend Tests' de arriba y descomenta lo siguiente:\n`, '')
    .replace(/      # -/g, '      -')
    .replace(/      # /g, '      ')
    .replace(/      #/g, '      ')
);

// SonarCloud
content = content.replace(
  /      - name: SonarQube Cloud scan\n        run: echo "SonarCloud scan temporarily disabled for fast deployment"\n      # TODO: Para restaurar SonarCloud, borra el 'SonarQube Cloud scan' de arriba y descomenta lo siguiente:\n(?:      #.*\n)+/,
  (match) => match
    .replace(`      - name: SonarQube Cloud scan\n        run: echo "SonarCloud scan temporarily disabled for fast deployment"\n      # TODO: Para restaurar SonarCloud, borra el 'SonarQube Cloud scan' de arriba y descomenta lo siguiente:\n`, '')
    .replace(/      # -/g, '      -')
    .replace(/      # /g, '      ')
    .replace(/      #/g, '      ')
);

// Integration Tests
content = content.replace(
  /      - name: Skip Integration Tests for fast deployment\n        run: echo "Integration tests temporarily disabled for fast deployment"\n      # TODO: Para restaurar las pruebas de integracion, borra el 'Skip Integration Tests' de arriba y descomenta lo siguiente:\n(?:      #.*\n)+/,
  (match) => match
    .replace(`      - name: Skip Integration Tests for fast deployment\n        run: echo "Integration tests temporarily disabled for fast deployment"\n      # TODO: Para restaurar las pruebas de integracion, borra el 'Skip Integration Tests' de arriba y descomenta lo siguiente:\n`, '')
    .replace(/      # -/g, '      -')
    .replace(/      # /g, '      ')
    .replace(/      #/g, '      ')
);

// ZAP
content = content.replace(
  /      - name: Skip ZAP for fast deployment\n        run: echo "OWASP ZAP tests temporarily disabled for fast deployment"\n      # TODO: Para restaurar los analisis de OWASP ZAP, borra el 'Skip ZAP' de arriba y descomenta todo lo siguiente:\n(?:      #.*(?:\n|$))+/,
  (match) => match
    .replace(`      - name: Skip ZAP for fast deployment\n        run: echo "OWASP ZAP tests temporarily disabled for fast deployment"\n      # TODO: Para restaurar los analisis de OWASP ZAP, borra el 'Skip ZAP' de arriba y descomenta todo lo siguiente:\n`, '')
    .replace(/      # -/g, '      -')
    .replace(/      # /g, '      ')
    .replace(/      #/g, '      ')
);

fs.writeFileSync('c:/Users/esteb/Documents/TESIS/EcenciaAPP/.github/workflows/main.yml', content, 'utf8');
console.log('done');
