# Dataset de voz: GitHub Pages + Supabase

Solo recogida de voces: no genera QR, no carga ECAPA y no compara participantes. GitHub Pages sirve la página; una Edge Function valida las invitaciones y guarda WAV originales en un bucket privado y metadatos en PostgreSQL. Las claves administrativas nunca entran en el navegador.

## Estado
Receptor desplegado en Supabase; publicación de la página en curso. Seis pruebas de validación pasan en Node y se ha comprobado sintaxis JS/TS. El usuario ha ejecutado la migración SQL y desplegado la función. No se ha probado el micrófono físico ni una subida válida. La función responde a las comprobaciones de CORS y rechaza invitaciones ausentes/inexistentes. Falta validar una sesión real. El prototipo Python anterior queda en prototype_python/ solo como referencia.

## 1. Crear Supabase
Crea un proyecto personal dedicado en https://supabase.com/dashboard y conserva su contraseña fuera del repositorio. Apunta la URL pública https://REFERENCIA.supabase.co. En SQL Editor ejecuta `supabase/migrations/202611150001_collection.sql` una vez en ese proyecto nuevo. Crea dos tablas, el bucket privado voice-recordings y la función de reserva. No añadas políticas públicas de lectura/escritura ni conviertas el bucket en público.

## 2. Desplegar el receptor
Con la CLI oficial de Supabase instalada y desde la raíz del repo:
```sh
supabase login
supabase link --project-ref REFERENCIA
supabase secrets set ALLOWED_ORIGINS=https://manumartin3112.github.io
supabase functions deploy collect-voice
```
La configuración en supabase/config.toml desactiva verify_jwt: la función autentica cada petición mediante la invitación privada enviada en X-Upload-Token. No es un endpoint abierto de subida. Las variables SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY las proporciona el entorno alojado de Supabase; no ponerlas en config.js. CORS admite solo los orígenes configurados (sin rutas ni barra final); no sustituye la autenticación.

## 3. Configurar la página
Editar config.js con la URL pública de la función:
```js
window.COLLECTION_CONFIG = {
 endpoint: "https://REFERENCIA.supabase.co/functions/v1/collect-voice",
 contact: "Contacto real del organizador",
 retention: "Plazo real de conservación acordado"
};
```
La web no inicia una sesión hasta completar los tres campos. Publicar SOLO index.html, app.js, recorder.js, config.js y .nojekyll. El workflow .github/workflows/pages.yml lo hace: en Settings > Pages elegir GitHub Actions; después ejecutar manualmente «Publicar recogida estática» desde la rama aprobada. El workflow no se activa por push. No enviar credenciales a GitHub. No hace falta dominio propio: se conserva la URL de Pages del repositorio.

## 4. Crear invitaciones privadas
En una terminal local configurar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (clave service_role de la API del proyecto). No pegarlas en el chat ni guardarlas en un script confirmado. Este administrador usa la clave service_role heredada con Bearer y apikey.
```powershell
$env:SUPABASE_URL = "https://REFERENCIA.supabase.co"
# Introducir la clave sin mostrarla en terminal ni escribirla en el historial:
$secret = Read-Host "Clave service_role" -AsSecureString
$env:SUPABASE_SERVICE_ROLE_KEY = [System.Net.NetworkCredential]::new('', $secret).Password
python scripts/admin.py invite P001 --days 30 --takes 24 --output invitations/P001.json
```
Envía a cada persona el enlace de Pages, su código P001 y su invitación privada. Cada invitación permite como máximo 24 tomas (6 sesiones completas), caduca a los 30 días y solo sirve para su participante. Usa el mismo identificador en futuras invitaciones para esa persona. El archivo invitations/ está ignorado por Git; quien posea esa invitación puede aportar muestras en nombre del participante. No es autenticación de identidad biométrica.

Para revocar: en el Table Editor de voice_invites marcar revoked=true en la invitación correspondiente. Puede localizarse por participant. No hace falta borrar las grabaciones para impedir nuevas subidas.

## 5. Recogida
Cuatro tomas de 8–30 s, recomendados 8–15 s, dos frases repetidas dos veces. Se graba WAV PCM mono, conservando la frecuencia del AudioContext. Se solicitan desactivados AGC, supresión de ruido y cancelación de eco, pero depende del navegador/dispositivo. El participante indica micrófono y condiciones y escucha antes de enviar. Cada visita crea una sesión UUID; cada toma tiene otro UUID. No se guarda la invitación en localStorage.

Se conservan fechas declaradas, recepción del servidor, frase, repetición, consentimiento versión 1, protocolo versión 1, duración real, frecuencia y SHA256. Las frases del protocolo 1 están en app.js: no cambiarlas sin incrementar la versión del protocolo en el receptor. No se mide voz efectiva ni se rechaza silencio; escuchar las tomas y analizar calidad después. Los roles registro/prueba se asignarán durante la evaluación conservando la separación por sesiones.

Un reintento con el mismo UUID y contenido recupera la subida. El estado pending reserva cupo aunque la subida no termine; el participante debe reintentar la misma toma antes de cerrar la página. No se reanudan tomas en memoria después de recargar. Las sesiones incompletas se conservan y deben contabilizarse en el análisis.

## 6. Descargar para analizar
Con las variables administrativas configuradas:
```sh
python scripts/admin.py download downloads/recogida
```
Descarga solo registros complete, pagina los resultados y verifica SHA256. Omite WAV ya presentes con el mismo hash. Genera manifest.json y audio/<UUID>.wav. No convierte ni normaliza. Conservar ambos juntos; no subir a Git. La herramienta no elimina ficheros locales si se han borrado del servidor: las solicitudes de eliminación deben aplicarse también a las copias descargadas.

El banco antiguo protocol/legacy requiere un adaptador para este manifiesto; no inventar equivalencias entre los UUID y a/a1/b/b1 ni mezclar sesiones.

## Validación antes de invitar a todo el grupo
1. Ejecutar `node --test tests/validation.test.mjs`.
2. Crear una invitación de prueba; comprobar que código equivocado, invitación caducada/revocada y acceso sin invitación son rechazados.
3. Desde Pages en móvil y Mac: grabar, escuchar y enviar cuatro tomas. Confirmar cuatro registros complete y cuatro WAV privados.
4. Interrumpir la conexión tras enviar y reintentar la misma toma: debe quedar un solo registro y objeto.
5. Descargar con admin.py y escuchar los WAV. Comprobar metadatos y hashes.
6. Confirmar que ni el navegador sin invitación ni una clave pública pueden listar tablas o leer el bucket. Comprobar reinicio y límites/cuotas de la cuenta.

No publicar claves ni los audios en Pages. La recogida es un piloto por invitación: vigilar consumo de almacenamiento y transferencia. Las reservas pendientes pueden ocupar cupo y necesitar revisión administrativa. Revisar contacto, finalidad y conservación con los participantes antes de difundir.

## Referencias
- https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site
- https://supabase.com/docs/guides/functions/auth
- https://supabase.com/docs/guides/storage/security/access-control

## Configuración elegida
URL del proyecto: https://etyabuzgiposbhzpmadm.supabase.co. Conservación: dos años desde la recogida. Contacto: organizador por el canal de la invitación, sin correo público. El plazo mostrado no programa el borrado: implementar y verificar limpieza de WAV y metadatos al vencimiento antes de operar la recogida de forma sostenida. La configuración pública no implica que la función esté desplegada.

## Desplegar desde el editor web con un solo archivo
Si el editor no incluye validate.mjs, ejecutar `python scripts/build_dashboard.py` y pegar TODO `deployment/collect-voice/index.ts` como index.ts en Supabase. Este archivo generado reúne validación y receptor, sin imports locales. Regenerarlo tras cualquier cambio en los originales; no editar la copia a mano. Nombre de función: collect-voice. Mantener Verify JWT desactivado y ALLOWED_ORIGINS configurado como se indica arriba.
