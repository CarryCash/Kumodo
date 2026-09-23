# Diccionario de Módulos

Esta documentación desglosa los principales módulos lógicos y visuales implementados en la aplicación para extender sus capacidades como "Copiloto de Reparaciones".

## Módulos en `src/main/lib/` (Controladores Backend)
- **`adb.ts` & `adb/package.ts`:** Funciones core para establecer comunicación ADB e interactuar con paquetes (instalar, desinstalar, listar).
- **`backup.ts`:** Controlador que gestiona los comandos ADB para empaquetar y transferir datos desde el móvil al PC.
- **`debloat/index.ts`:** Contiene la lógica para buscar aplicaciones de fábrica innecesarias basadas en bases de datos (`debloat/database.ts`) y deshabilitarlas de forma segura.
- **`forensic.ts`:** Ejecuta comandos avanzados de ADB para extraer información del sistema (propiedades, volcados de estado, datos de aplicaciones) para análisis profundos.
- **`history.ts`:** Maneja la obtención del historial de uso y eventos del dispositivo.
- **`security.ts`:** Escanea el dispositivo en busca de configuraciones inseguras, permisos root no deseados, o puertos abiertos.
- **`wireless.ts`:** Facilita la configuración de TCP/IP en el dispositivo para permitir una conexión inalámbrica ADB.
- **`media.ts`:** Facilita la transferencia y previsualización de archivos multimedia entre el PC y el teléfono.

## Componentes en `src/renderer/main/components/` (Frontend UI)
- **`application/DebloaterModal.tsx`:** Interfaz visual para el usuario donde puede seleccionar qué apps del sistema remover.
- **`backup/Backup.tsx`:** Panel visual para iniciar y monitorear el progreso de las copias de seguridad.
- **`chat/ChatAdb.tsx`:** El asistente conversacional integrado (Gemini AI).
- **`logcat/LogAnalyzer.tsx`:** Herramienta visual que toma los logs en crudo, los formatea y utiliza IA para encontrar errores.
- **`performance/CleanerModal.tsx`:** Interfaz para gatillar la limpieza de cachés.
- **`toolbar/ForensicModal.tsx` & `toolbar/WirelessBridgeModal.tsx`:** Modales accesibles desde la barra de herramientas para tareas específicas.
