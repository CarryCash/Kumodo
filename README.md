# Copiloto de Reparaciones Celulares (Kumodo)

Bienvenido a **Copiloto de Reparaciones Celulares**, una herramienta integral de diagnóstico, mantenimiento y análisis forense para dispositivos móviles basada en ADB.

Esta aplicación de escritorio ha sido diseñada específicamente para técnicos de telefonía móvil, ofreciendo una solución "todo en uno" que automatiza y simplifica las tareas más complejas de reparación de software, gestión de aplicaciones y auditoría de dispositivos.

## Características Principales

*   **Asistente de Diagnóstico:** Identificación rápida de problemas de software y hardware (batería, almacenamiento, rendimiento).
*   **Gestión de Dispositivos (Debloater):** Eliminación segura de bloatware y aplicaciones de fábrica para mejorar el rendimiento del dispositivo.
*   **Copias de Seguridad (Backup):** Respaldo de información del usuario y aplicaciones de forma rápida y estructurada.
*   **Auditoría de Seguridad y Forense:** Extracción avanzada de volcados de memoria, logs del sistema (Logcat), e inspección de configuraciones de riesgo.
*   **Puente Inalámbrico ADB:** Conexión y gestión de dispositivos sin necesidad de cables (Wireless Bridge).
*   **Visor de Multimedia y Archivos:** Explorador potente para transferencia de datos entre el móvil y el PC.

## Instalación y Uso

Para obtener instrucciones detalladas sobre cómo configurar el entorno de desarrollo y utilizar el software, consulta la documentación en la carpeta `docs/`:

*   [Guía de Instalación](docs/instalacion.md)
*   [Guía de Usuario Rápida](docs/guia_usuario.md)
*   [Arquitectura del Sistema](docs/arquitectura.md)

## Créditos y Agradecimientos

Este proyecto (gestionado internamente como *Kumodo*) es un fork directo y una extensión del proyecto de código abierto **[AYA (Android ADB Desktop App)](https://github.com/liriliri/aya)**, creado originalmente por **[liriliri](https://github.com/liriliri)**. 

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
