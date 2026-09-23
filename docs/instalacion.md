# Guía de Instalación y Configuración

Esta guía detalla los pasos necesarios para instalar y configurar el entorno de desarrollo para el "Copiloto de Reparaciones Celulares".

## Prerrequisitos

Para poder ejecutar y compilar este proyecto, necesitas tener instalados los siguientes componentes en tu sistema:
1. **Node.js:** Versión 18.x o superior.
2. **NPM o Yarn:** Gestor de paquetes para Node.js.
3. **Android Platform Tools (ADB):** Necesario para que el sistema reconozca comandos ADB si no se usa el binario empaquetado.
4. **Git:** Para clonar el repositorio y manejar el control de versiones.

## Clonación e Instalación

1. Clona el repositorio en tu máquina local:
   ```bash
   git clone https://github.com/CarryCash/Copiloto-reparaciones-celulares.git
   cd Copiloto-reparaciones-celulares
   ```

2. Instala las dependencias del proyecto:
   ```bash
   npm install
   ```

## Ejecución en Modo Desarrollo

Para iniciar la aplicación en modo desarrollo (con Hot Module Replacement / recarga automática):

```bash
npm run dev
```
Esto iniciará simultáneamente los procesos Main, Preload y Renderer de Electron mediante Vite.

## Empaquetado para Producción

Para compilar y empaquetar la aplicación para su distribución final:

```bash
# Para compilar los binarios
npm run build

# Para empaquetar en el sistema operativo actual (Windows/Mac/Linux)
npm run pack
```

## Configuración de Variables de Entorno
Si el proyecto requiere claves de API externas (por ejemplo, para la integración con Gemini AI), estas deben configurarse en un archivo `.env` en la raíz del proyecto. Asegúrate de nunca subir (commit) este archivo al repositorio público.
