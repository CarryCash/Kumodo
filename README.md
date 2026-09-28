# Copiloto de Reparaciones Celulares (Kumodo)

Bienvenido a **Copiloto de Reparaciones Celulares**, una herramienta integral de diagnóstico, mantenimiento y análisis forense para dispositivos móviles basada en ADB.

Esta aplicación de escritorio ha sido diseñada específicamente para técnicos de telefonía móvil, ofreciendo una solución "todo en uno" que automatiza y simplifica las tareas más complejas de reparación de software, gestión de aplicaciones y auditoría de dispositivos.

## Características Principales

*   **Asistente de Diagnóstico:** Identificación rápida de problemas de software y hardware (batería, almacenamiento, rendimiento).
*   **Gestión de Dispositivos (Debloater):** Eliminación segura de bloatware y aplicaciones de fábrica para mejorar el rendimiento del dispositivo.
*   **Copias de Seguridad (Backup):** Respaldo de información del usuario y aplicaciones de forma rápida y estructurada.
*   **Auditoría de Seguridad y Forense:** Extracción avanzada de volcados de memoria, logs del sistema (Logcat), e inspección de configuraciones de riesgo.
*   **Sondeo Root Autorizado:** Detección de builds `user`, `userdebug` y `eng`, disponibilidad de shell root y presencia de Magisk o KernelSU mediante comprobaciones de solo lectura. Cada sondeo requiere confirmación explícita y queda registrado en la auditoría.
*   **Puente Inalámbrico ADB:** Conexión y gestión de dispositivos sin necesidad de cables (Wireless Bridge).
*   **Visor de Multimedia y Archivos:** Explorador potente para transferencia de datos entre el móvil y el PC.

### Herramientas para Root Autorizado

Esta función está pensada para diagnóstico técnico de dispositivos propios o entregados con autorización. Kumodo separa la inspección de solo lectura de la solicitud de una sesión ADB con privilegios elevados.

#### Qué detecta

* **Tipo de compilación:**
	* `user`: compilación de producción, normalmente sin shell root ADB.
	* `userdebug`: compilación de desarrollo basada en producción; puede permitir ADB root según la configuración del fabricante.
	* `eng`: compilación de ingeniería, con capacidades de depuración más amplias.
* **Identidad ADB:** usuario y grupos devueltos por `id`.
* **Disponibilidad root:** resultado de la comprobación fija `su -c id`, sin ejecutar comandos proporcionados por el usuario.
* **Magisk:** binario disponible y directorio conocido de instalación.
* **KernelSU:** `ksud` y directorio conocido de instalación.
* **Estado de depuración:** valor de `ro.debuggable` y tipo de build reportado por Android.

#### Flujo de autorización

1. El técnico selecciona un dispositivo ADB conectado y verifica que el modelo y número de serie sean los esperados.
2. Kumodo muestra una confirmación explícita antes de realizar el sondeo root.
3. El backend vuelve a comprobar la autorización recibida; una llamada IPC sin confirmación se bloquea aunque proceda de la interfaz.
4. El sondeo devuelve un informe con la identidad ADB, identidad root, tipo de build, estado de depuración y detección de Magisk/KernelSU.
5. Si se solicita `adb root`, la operación requiere la misma autorización y se registra por separado. El fabricante o la build pueden rechazarla; eso no se interpreta como un error de Kumodo.

#### Modo de solo lectura

El sondeo autorizado ejecuta únicamente comprobaciones de identidad, propiedades del sistema y presencia de archivos o binarios. No instala módulos, no cambia permisos, no desmonta particiones, no borra datos y no modifica el patrón, PIN, cuentas ni bloqueo del dispositivo. Tampoco proporciona una consola root arbitraria.

#### Auditoría

Cada comando fijo se registra en el historial de auditoría con:

* dispositivo objetivo;
* comando ejecutado;
* fecha y hora;
* resultado (`success`, `blocked` o `error`);
* actor de escritorio;
* detalle de la operación y confirmación requerida.

Las solicitudes canceladas o no autorizadas también quedan registradas. El resultado puede consultarse junto con la auditoría de seguridad y exportarse dentro del informe técnico.

#### Límites técnicos

La detección de Magisk o KernelSU es indicativa: ocultación, cambios de ruta, políticas SELinux o restricciones del fabricante pueden impedir ver todos los componentes. La disponibilidad de `su -c id` tampoco garantiza que cualquier operación root sea segura o permitida. Las operaciones destructivas y eludir autenticación del dispositivo quedan fuera de esta herramienta.

## Instalación y Uso

Para obtener instrucciones detalladas sobre cómo configurar el entorno de desarrollo y utilizar el software, consulta la documentación en la carpeta `docs/`:

*   [Guía de Instalación](docs/instalacion.md)
*   [Guía de Usuario Rápida](docs/guia_usuario.md)
*   [Arquitectura del Sistema](docs/arquitectura.md)

## Créditos y Agradecimientos

Kumodo es una extensión de una aplicación de escritorio de código abierto para Android y ADB, creada originalmente por **[liriliri](https://github.com/liriliri)**. Los avisos de origen y licencias del código heredado se detallan en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Queremos expresar nuestro profundo agradecimiento a los creadores y contribuyentes de **AYA**, ya que su excelente base, UI (Luna) y herramientas de envoltura para ADB hicieron posible el desarrollo de este Copiloto de Reparaciones. Todo el código base para la exploración de archivos, visualización de pantalla y monitoreo de red fue heredado y adaptado de su gran labor.

## Licencia

Este repositorio se distribuye bajo la licencia de Kumodo: GNU Affero General Public License v3.0 (AGPL-3.0). El archivo [LICENSE](LICENSE) en la raíz aplica al código y al paquete principal del proyecto.

No obstante, este proyecto incluye componentes, dependencias y binarios de terceros con sus propios términos. En particular:

* `@devicefarmer/adbkit` y otros componentes del ecosistema Android/ADB suelen estar bajo licencia Apache 2.0.
* Las bibliotecas de frontend y Electron (React, Vite, Electron, etc.) suelen usar MIT o licencias compatibles con MIT.
* Los servicios de Gemini / Google AI están sujetos a los términos de uso y API de Google, no a una licencia de código abierto del repositorio.
* Los binarios de ffmpeg y componentes del SDK de Android / AOSP deben respetar sus licencias originales y sus condiciones de redistribución.

Por tanto, la licencia del repositorio no reubica ni reemplaza las licencias de terceros: se deben conservar los avisos, licencias y condiciones aplicables de cada componente. Para un resumen más detallado, consulta [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

> Nota: si partes de Kumodo derivan de AYA u otros proyectos de terceros, debes mantener sus avisos legales y comprobar que la combinación de licencias sea compatible con tu distribución concreta. Este repositorio no sustituye el asesoramiento legal profesional.
