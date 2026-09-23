# Origen y Evolución del Proyecto (Kumodo)

Este documento detalla la historia y procedencia de este proyecto.

## El Origen: Proyecto AYA
La base técnica de esta aplicación proviene del proyecto de código abierto **AYA** (Android ADB Desktop App), desarrollado por *liriliri*. AYA nació como una excelente interfaz gráfica (GUI) construida sobre Electron para ejecutar comandos ADB de forma amigable. Proveía funciones vitales como:
- Reflejo de pantalla (Scrcpy)
- Explorador de archivos
- Monitor de procesos (CPU, Memoria)
- Terminal ADB interactiva

## La Transformación: Copiloto de Reparaciones
Bajo el nombre en clave **"Kumodo"**, tomamos el repositorio original de AYA y comenzamos una reestructuración enfocada en un nicho de mercado muy específico: **el técnico de reparación de celulares**.

Mientras que AYA estaba diseñado para desarrolladores de apps y usuarios curiosos, nosotros extendimos el código para inyectarle lógica de diagnóstico:
1. **Módulo de Mantenimiento:** Se agregaron funciones de 'Debloater' y limpieza de cachés, vitales para resolver problemas de lentitud de los cuales los clientes frecuentemente se quejan.
2. **Módulo Forense y de Seguridad:** Se desarrollaron interfaces que aprovechan ADB de manera más profunda para extraer estados de memoria y auditar configuraciones de riesgo, protegiendo al usuario final.
3. **Módulo de Respaldo Seguro:** Se implementó una interfaz amigable para que el técnico no pierda datos del cliente antes de un flasheo de software.
4. **Inteligencia y Asistencia:** El mayor salto evolutivo fue dotar a la plataforma de "cerebro" para interpretar esos miles de datos crudos (Logcats) y convertirlos en pasos de reparación.

En resumen, tomamos un excelente "Visor ADB" y lo transformamos en una verdadera "Herramienta de Diagnóstico Profesional".
