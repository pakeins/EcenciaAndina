# Roadmap de Mejoras Arquitectónicas y CI/CD

Este documento consolida todas las ideas de mejora y rediseño de arquitectura sugeridas por la profesora, con el objetivo de ir implementándolas de forma iterativa y segura.

## 1. Integración y Despliegue Continuo (CI/CD)

| ID | Mejora Propuesta | Justificación / Beneficio | Estado |
|---|---|---|---|
| CI-01 | **Dividir el Pipeline en Jobs Paralelos** | Pasar de un gran bloque `quality` a módulos paralelos (`code-quality`, `security-audit`, `unit-tests`, `build`). Mejora la velocidad y visibilidad de errores (CircleCI style). | ✅ Completado |
| CI-02 | **Reemplazar `npm audit` por Trivy** | Trivy permite escanear no solo dependencias de Node, sino también vulnerabilidades del SO de la imagen Docker generada y configuraciones erróneas. | ✅ Completado (Configurado) |
| CI-03 | **Integrar SonarCloud correctamente** | Separar el paso de cobertura y asegurar que SonarCloud procese el reporte de lcov para medir la calidad y deuda técnica del código. | ✅ Completado (Configurado) |
| CI-04 | **Migrar de SCP a despliegue automatizado** | SCP/SSH no es ideal. Se debe usar GitHub Container Registry (GHCR) y Watchtower/ArgoCD para que el servidor actualice las imágenes de forma automática (pull-based). | ⏳ Pendiente |
| CI-05 | **Smoke Tests con Newman/Postman** | Reemplazar el viejo `curl` por Newman para ejecutar pruebas reales de API y aserciones sobre JSON. | ✅ Completado |

## 2. Refactorización de Arquitectura (Microservicios)

| ID | Mejora Propuesta | Justificación / Beneficio | Estado |
|---|---|---|---|
| ARQ-01 | **Separar el Bot y el Backend (SRP)** | Aplicar el Principio de Responsabilidad Única. El monolito se debe dividir para que el bot y el backend escalen por separado. | ⏳ Pendiente |
| ARQ-02 | **Migrar el Bot a Serverless (Azure Functions/Lambda)** | Funciones serverless son más económicas, integrables y escalables por evento. Ideal para el webhook del bot. | ⏳ Pendiente |
| ARQ-03 | **API Agnóstica de Mensajería** | El backend no debe saber que usa "Telegram". Debe consumir/proveer una API genérica que luego el microservicio del bot traduce a Telegram (o a WhatsApp futuro). | ⏳ Pendiente |
| ARQ-04 | **Arquitectura Orientada a Eventos** | Romper el paradigma tradicional Cliente-Servidor en el backend para adoptar comunicación por eventos, lo que mejora el rendimiento y consistencia. | ⏳ Pendiente |
| ARQ-05 | **Documentar Justificación de Supabase** | Redactar formalmente por qué se eligió Supabase basándose en los 11 patrones de diseño arquitectónico. | ⏳ Pendiente |

## 3. Pruebas y Aseguramiento de Calidad

| ID | Mejora Propuesta | Justificación / Beneficio | Estado |
|---|---|---|---|
| QA-01 | **Pruebas de Integración Separadas** | Implementar `Jest + Supertest` o Testcontainers para evaluar la API como un todo conectado a una DB real/pruebas. | ⏳ Pendiente |
| QA-02 | **Pruebas de Latencia (Frontend)** | Incorporar test en React (ej. Lighthouse CI o Cypress) para medir tiempos de carga y garantizar que no haya bloqueos en la Experiencia de Usuario (UX). | ⏳ Pendiente |
| QA-03 | **Pruebas de Rendimiento (Backend)** | Utilizar `k6` o `JMeter` en el pipeline para confirmar que el sistema aguanta la concurrencia bajo los principios arquitectónicos propuestos. | ⏳ Pendiente |
| QA-04 | **Plan de pruebas para la API Agnóstica** | Crear pruebas automatizadas que valoren la interfaz de comunicación entre el Backend y el Microservicio del Bot. | ⏳ Pendiente |

## 4. Trabajos Futuros y Observabilidad

| ID | Mejora Propuesta | Justificación / Beneficio | Estado |
|---|---|---|---|
| FUT-01 | **Orquestación con Kubernetes** | Al tener Docker (n8n, Backend), migrar la VM hacia K3s o AKS para robustecer la alta disponibilidad. | ⏳ Trabajo Futuro |
| FUT-02 | **Módulo de Observabilidad (Prometheus)** | Tener métricas en tiempo real del uso de CPU/RAM y respuestas de la API, usando Prometheus y Grafana. | ⏳ Trabajo Futuro |
| FUT-03 | **Gestor Gráfico del Bot** | Extender el Frontend en React para poder visualizar, gestionar y cambiar la configuración del bot sin tocar código. | ⏳ Trabajo Futuro |
