# Recogida pública de voces — GitHub Pages + Supabase

Cualquier persona con el enlace puede rellenar sus datos y enviar cuatro grabaciones. No se piden invitaciones ni códigos, no se generan QR ni comparaciones. Las tablas y WAV son privados; solo el receptor alojado tiene acceso de escritura y la administración puede descargar.

## Estado y actualización necesaria
El usuario ha aplicado la migración pública y desplegado el receptor actualizado. Se ha comprobado que las peticiones sin invitación llegan a la validación de audio. Para reproducir el despliegue en otro entorno, aplicar estos dos pasos antes de publicar el frontend:

1. SQL Editor: ejecutar `supabase/migrations/202611160002_public_collection.sql`, después de la migración inicial ya ejecutada. Conserva las tablas y muestras previas. No volver a ejecutar la inicial.
2. Edge Functions → collect-voice → editor: reemplazar todo index.ts por `deployment/collect-voice/index.ts` y desplegar. Mantener Verify JWT desactivado y secreto ALLOWED_ORIGINS=https://manumartin3112.github.io.

El archivo único se genera con `python scripts/build_dashboard.py`. No editarlo a mano. Los originales están en supabase/functions/collect-voice/.

Después, subir la rama mejora/recogida-voces inicia el workflow de Pages. El workflow publica solamente index.html, app.js, config.js, recorder.js y .nojekyll. URL: https://manumartin3112.github.io/dataset-voz/. No es necesario fusionar main.

## Protocolo público 2
Recupera nombre, primer apellido, edad, sexo, nacionalidad y acento del formulario original; añade dispositivo y condiciones opcionales. Conserva sus instrucciones y estas frases, cada una dos veces:

- Buenos días soy [Nombre y Primer apellido] y esto es una prueba de reconocimiento de voz.
- Buenos días soy [Nombre y Primer apellido] y esta grabación se utiliza para otra comprobación del sistema.

WAV PCM mono de 16 bits a la frecuencia del navegador (no remuestreado), de 3 a 30 segundos. El mínimo anterior de 8 segundos se reduce porque las frases originales pueden durar menos: no pedir texto improvisado ni silencio para rellenar. Esto no detecta silencio, clipping ni garantiza calidad biométrica; la evaluación posterior debe medirlos.

Se pueden escuchar y repetir tomas antes de enviar. Los datos se fijan al iniciar la primera grabación para no mezclar identidades. Al enviar se requiere consentimiento. Si se interrumpe, reintentar desde la misma página conserva UUID y no reenvía las tomas confirmadas. Una toma cuyo envío ya se ha intentado no se puede reemplazar, para evitar conflictos con confirmaciones perdidas. Recargar pierde las tomas locales no enviadas.

Cada sesión tiene un UUID automático; no se infiere que nombres iguales sean la misma persona. El campo participant en metadatos es la referencia de sesión, NO una identidad biométrica verificada. Para pruebas entre días/dispositivos hace falta revisar la correspondencia entre sesiones antes de construir pares genuinos/impostores.

## Archivos y privacidad
Ejemplo de nombre privado: Ana_Garcia_30_M_Espanola_Madrileno_2026_11_16_frase1_toma1_UUID.wav. Normaliza caracteres y limita longitud; conserva los datos originales completos en metadata. El UUID evita sobrescrituras por nombres iguales. Los nombres no se incluyen en el repo ni en una galería pública.

El aviso final describe finalidad, datos, retirada y dos años de conservación, con consentimiento explícito. No se localizó una copia literal del aviso antiguo en main; se conserva la información de privacidad disponible, sin afirmar equivalencia legal. Contacto con el organizador por el canal del enlace. El texto no programa la eliminación: aún falta automatizar/verificar el borrado de WAV y registros a los dos años y tramitar retiradas solicitadas.

## Controles del receptor
Valida cuerpo limitado a 8,1 MB, WAV de hasta 8 MB, metadatos y consentimiento. Sin claves de administración en el navegador. Solo servicio puede llamar reserve_public_voice_take; tablas con RLS y bucket privado. CORS permite la web configurada, pero NO es autenticación ni impide scripts externos.

Reserva serializada en BD: idempotencia por UUID + SHA256 + metadatos, cuatro combinaciones frase/toma únicas por sesión, datos de sesión coherentes y escritura sin sobrescribir. Solo confirma después de guardar el objeto y marcar complete. Los reintentos comprueban el contenido ya existente si se perdió la respuesta de subida.

voice_collection_settings permite pausar (enabled=false). Límites iniciales: 700.000.000 bytes reservados de nuevas tomas y 400 tomas/día; pendientes también cuentan. No son una protección completa contra bots: alguien podría agotar el cupo. No se afirma disponibilidad para tráfico masivo. No hay CAPTCHA ni identificación real del participante. Al agotarse la capacidad devuelve 429 y no confirma el envío. Las muestras anteriores tienen size_bytes=0 y deben contabilizarse aparte si existen.

## Descargar
Desde una terminal privada con Python, definir SUPABASE_URL=https://etyabuzgiposbhzpmadm.supabase.co y SUPABASE_SERVICE_ROLE_KEY con la clave legacy service_role del proyecto (nunca en Git, config.js ni mensajes de chat). Ejecutar:

```sh
python scripts/admin.py download downloads/recogida
```
Descarga WAV completos con sus nombres y manifest.json, verifica SHA256. Conserva compatibilidad con UUID.wav de la versión anterior. Una descarga no elimina archivos locales aunque se hayan retirado del servidor: gestionar también esas copias. El comando invite y tablas de invitaciones quedan solo por compatibilidad; no se usan en el flujo público. prototype_python/ es un prototipo histórico, no desplegarlo.

## Comprobaciones
```sh
node --test tests/*.test.mjs
node --check app.js
python scripts/build_dashboard.py
```
Las pruebas simulan HTTP/Storage y el DOM; no sustituyen ejecutar SQL, comprobar RLS y Storage reales ni probar micrófono en móvil/Mac. Antes de distribuir: una sesión real, confirmar cuatro filas complete, cuatro WAV privados y descarga íntegra; probar reintento y petición inválida. No mezclar muestras sintéticas de tests con las de evaluación.
