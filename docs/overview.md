# Copiloto de Reparaciones Celulares - Overview

## ¿Qué es este proyecto?
El "Copiloto de Reparaciones Celulares" es una aplicación de escritorio avanzada basada en ADB, diseñada específicamente para técnicos de telefonía móvil. Se ha construido tomando como base un gestor ADB existente y extendiendo sus capacidades para convertirlo en una herramienta todo-en-uno que facilita el diagnóstico, mantenimiento, y reparación de dispositivos Android.

## ¿Qué hemos hecho hasta ahora?
Hasta el momento, hemos transformado la aplicación base agregando módulos clave para la reparación y el diagnóstico técnico. Las características implementadas incluyen:

1. **Gestión de Aplicaciones y Debloater:** Interfaz para administrar aplicaciones instaladas, junto con un módulo "Debloater" (`DebloaterModal`) para limpiar aplicaciones de fábrica innecesarias de manera segura.
2. **Copias de Seguridad (Backup):** Integración de funcionalidades para respaldar y restaurar la información del usuario (`Backup.tsx`, `backup.ts`).
3. **Análisis de Batería y Rendimiento:** Herramientas para monitorear la salud de la batería (`Battery.tsx`) y optimizar el rendimiento del sistema mediante limpieza (`CleanerModal`).
4. **Almacenamiento y Archivos Multimedia:** Explorador avanzado de almacenamiento y un previsualizador de medios (`Media.tsx`, `MediaPreviewModal`).
5. **Herramientas de Log y Diagnóstico:** Un analizador de logs inteligente (`LogAnalyzer.tsx`) y una librería de comandos ADB (`CommandLibraryModal`) listos para usar, que facilitan encontrar la raíz de los problemas.
6. **Seguridad y Forense:** Auditorías de seguridad (`SecurityAuditModal`), extracción forense de datos (`ForensicModal`, `forensic.ts`), y lectura de historial del dispositivo (`history.ts`).
7. **Puente Inalámbrico (Wireless Bridge):** Conexiones inalámbricas ADB simplificadas (`WirelessBridgeModal`).
8. **Asistente Inteligente (ChatAdb):** Integración de una IA que ayuda al técnico en tiempo real (`ChatAdb.tsx`).

## Arquitectura
El proyecto sigue una arquitectura Electron clásica (Main/Renderer) empaquetada con Vite, con React para la interfaz de usuario. En la carpeta `src/main/lib/` residen los controladores de bajo nivel para interactuar con ADB, y en `src/renderer/main/components/` se encuentran todas las interfaces de usuario modulares.
