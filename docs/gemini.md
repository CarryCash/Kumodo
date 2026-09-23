# Integración con Google Gemini AI

El "Copiloto de Reparaciones Celulares" no es solo una herramienta manual, sino un asistente inteligente. Para esto, hemos implementado una integración profunda con la Inteligencia Artificial.

## Implementación
El módulo de IA se encuentra principalmente gestionado en el archivo `src/renderer/main/lib/ai.ts` y se expone al usuario a través del componente `ChatAdb.tsx`.

## Casos de Uso Actuales
1. **Asistencia de Comandos:** El técnico puede pedir a la IA (vía chat) que genere comandos ADB específicos para situaciones inusuales.
2. **Análisis de Logs (LogAnalyzer):** La IA puede recibir fragmentos de logs (Logcat) cuando un dispositivo se reinicia solo o una app crashea, y explicarle al técnico en lenguaje natural cuál es la raíz del problema y cómo solucionarlo.
3. **Auditoría de Seguridad:** Al extraer datos de seguridad del dispositivo, la IA puede resumir posibles vulnerabilidades o configuraciones de riesgo.

## Próximos Pasos
- Mejorar el contexto del prompt para que la IA conozca exactamente el modelo del dispositivo, versión de Android y estado de la batería antes de responder.
- Generar scripts de automatización de reparaciones directamente desde el chat.
