# Registro de Bugs y Problemas Conocidos

En este documento se registrarán los errores identificados durante el desarrollo del "Copiloto de Reparaciones Celulares" y su estado actual de resolución.

## Bugs Activos

- *(Actualmente no hay bugs críticos documentados. A medida que se realicen pruebas exhaustivas de la interfaz y la comunicación con ADB en diferentes modelos de Android, se listarán aquí).*

## Bugs Resueltos (Historial)

- **Ejemplo:** Fallo de conexión al iniciar el scrcpy en ciertos dispositivos antiguos. *(Resuelto)*

## Notas para Pruebas (QA)
Al probar nuevas funcionalidades, prestar especial atención a:
1. **Permisos de ADB:** Algunas funciones como el "Debloater" o la "Extracción Forense" pueden fallar si el dispositivo no tiene permisos root o si ciertos comandos están restringidos por el fabricante (OEM).
2. **Manejo de Desconexiones:** Asegurar que si el cable USB se desconecta durante un *Backup* o *Auditoría de Seguridad*, la aplicación no colapse y muestre un error amigable.
