# Activación de Digital Forge CMS + CRM + Portal del Cliente

La página pública seguirá funcionando al subir los archivos. Para activar el guardado de leads, el panel y el portal privado, completa estos pasos en Cloudflare.

## 1. Crear la base de datos

1. Entra en Cloudflare.
2. Abre **Workers & Pages → D1 SQL Database → Create database**.
3. Usa el nombre `digital-forge-db`.
4. Abre la consola de la base de datos, copia el contenido de `schema.sql` y ejecútalo.

## 2. Conectar la base a la web

1. Abre el proyecto `digitalforgecreative` en **Workers & Pages**.
2. Ve a **Settings → Bindings → Add binding → D1 database**.
3. En **Variable name** escribe exactamente `DB`.
4. Selecciona `digital-forge-db` y guarda.
5. Vuelve a desplegar el proyecto.

## 3. Proteger el panel

1. En **Settings → Variables and Secrets**, crea un secreto llamado `ADMIN_TOKEN`.
2. Usa una clave larga y única. No la escribas dentro de ningún archivo.
3. El panel estará disponible en `/admin/` y te pedirá esa clave.

## 4. Activar el correo automático (opcional hasta tener la cuenta)

El proyecto está preparado para Resend. Añade como secretos o variables:

- `RESEND_API_KEY`: clave de Resend.
- `EMAIL_FROM`: remitente verificado, por ejemplo `Digital Forge <hola@tudominio.com>`.
- `EMAIL_TO`: correo que recibirá las nuevas solicitudes.

Si todavía no configuras estos datos, los leads se guardarán normalmente en el CRM, pero no se enviará el email automático.

## 5. Calendly y PayPal

Entra en `/admin/` y abre **Configuración**:

- Pega tu enlace de Calendly cuando lo tengas.
- PayPal ya está configurado como `https://www.paypal.com/paypalme/MariaRios810`.

## 6. Activar el Portal del Cliente

Las nuevas tablas se crean automáticamente la primera vez que el panel llama a la base de datos. También puedes ejecutar `migrations/002_client_portal.sql` en la consola de `digital-forge-db`.

El portal estará disponible en `/portal/`. Desde `/admin/`:

1. Abre **Portal / Clientes** y crea la cuenta del cliente.
2. Usa una contraseña temporal de al menos 12 caracteres y compártela de forma privada.
3. Abre **Portal / Proyectos** y asigna un proyecto al cliente.

## 7. Almacenamiento privado de archivos

Para subir versiones de video y entregas finales:

1. En Cloudflare abre **R2 Object Storage → Create bucket**.
2. Usa el nombre `digital-forge-files`.
3. En el proyecto `digitalforgecreative`, ve a **Settings → Bindings → Add → R2 bucket**.
4. En **Variable name** escribe exactamente `FILES`.
5. Selecciona `digital-forge-files`, guarda y crea un nuevo despliegue.

Los archivos no se publican directamente. La web verifica qué cliente inició sesión antes de servir cada video o descarga. La subida desde el panel admite archivos de hasta 95 MB en esta primera versión.

## Publicación

Sube todos los archivos y carpetas del paquete al repositorio. Las carpetas `functions/` y `admin/` son necesarias; no subas únicamente `index.html`.
