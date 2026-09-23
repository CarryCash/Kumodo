# Integración con Google Gemini AI (Especificación Técnica)

Este módulo gestiona la conexión con la API de Google Gemini para proporcionar asistencia inteligente (generación de comandos ADB, análisis forense de logs y auditoría de seguridad).

## 1. Configuración de la API Key (`GEMINI_API_KEY`)
> [!CAUTION]
> **La `GEMINI_API_KEY` NO debe inyectarse vía variables de entorno (`.env`) en producción.** 

Para proteger la integridad de los tokens y evitar robo de credenciales en máquinas cliente, la aplicación gestiona la clave de la siguiente manera:
1. **Ingreso:** El usuario ingresa la clave en la Interfaz de Ajustes (`SettingsModal.tsx`).
2. **Transmisión:** Se envía al proceso Main a través del puente IPC (`setSettingsStore`).
3. **Cifrado en Disco (`safeStorage`):** La lógica real está centralizada en `src/main/lib/store.ts`. Cuando se guarda `geminiApiKey`, el store intercepta el valor y, si el sistema operativo soporta cifrado por hardware/OS (DPAPI en Windows, Keychain en macOS, libsecret en Linux), Electron cifra la cadena automáticamente antes de persistirla en `data/settings.json` (codificada en Base64).
4. **Descifrado:** Al leer la clave, el mismo store la descifra en memoria y la expone al Renderer. Si el archivo `settings.json` se extrae y lleva a otra máquina, no será útil sin el sistema de cifrado del usuario.

## 2. Contrato de API (Frontend)
El módulo se encuentra en `src/renderer/main/lib/ai.ts`. La firma real del helper es esta:

```typescript
export async function askGeminiForAdbCommand(
  userPrompt: string
): Promise<{ command: string; explanation: string }>
```
- `userPrompt`: Instrucción en lenguaje natural proporcionada por el técnico.
- Devuelve un objeto con `command` y `explanation`.
- La `apiKey` se obtiene internamente desde `store.settings.geminiApiKey`, ya sea leída de disk o decodificada por `safeStorage`.
- No se usa un parámetro `context` adicional en la implementación actual.

## 3. Salvaguardas de Ejecución (Guardarraíles)
En `src/renderer/main/components/chat/ChatAdb.tsx`, **ningún comando generado por IA se ejecuta ciegamente**. Antes de llamar a `main.execAdb(...)`, el comando se analiza contra patrones destructivos:
```javascript
const dangerousPattern = /\b(wipe|format|rm\s+-rf|fastboot\s+erase|dd)\b/i
```
Si hay coincidencia, la ejecución queda bloqueada a menos que el usuario escriba explícitamente "confirmar" en un `window.prompt`.
