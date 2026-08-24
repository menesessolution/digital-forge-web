# Portal del Cliente — instalación

Esta actualización conserva la web, el CMS, el CRM, PayPal y todos los datos existentes. Añade:

- Cuentas privadas para clientes.
- Proyectos con estado, fecha y porcentaje de avance.
- Versiones para revisión.
- Aprobación o solicitud de cambios.
- Comentarios entre el cliente y Digital Forge.
- Entregas y descargas privadas.
- Vista en español e inglés.

## 1. Publicar la actualización

Reemplaza todos los archivos de `digital-forge-web` con los del ZIP y ejecuta:

```bash
cd ~/Desktop/digital-forge-web
git add .
git commit -m "update: add secure client portal"
git push origin main
```

No hace falta crear nuevamente D1. Las tablas del portal se crean automáticamente al abrir el panel después del nuevo despliegue.

## 2. Crear el almacenamiento privado

1. Abre Cloudflare.
2. Entra en **R2 Object Storage → Create bucket**.
3. Nombre: `digital-forge-files`.
4. Abre **Workers & Pages → digitalforgecreative → Settings → Bindings**.
5. Selecciona **Add → R2 bucket**.
6. En **Variable name** escribe exactamente `FILES`.
7. Selecciona `digital-forge-files` y guarda.
8. Crea un nuevo despliegue para aplicar el binding.

## 3. Crear un cliente y proyecto

1. Abre `https://digitalforgecreative.pages.dev/admin/`.
2. Entra en **Portal / Clientes** y crea la cuenta.
3. La contraseña temporal debe tener al menos 12 caracteres. Compártela de forma privada y no la incluyas en capturas.
4. Entra en **Portal / Proyectos** y asigna el proyecto.
5. Sube una versión para revisión o una entrega final.
6. Comparte `https://digitalforgecreative.pages.dev/portal/` con el cliente.

La primera versión admite archivos de hasta 95 MB por subida. Los archivos guardados en R2 no son públicos: la función verifica la sesión y la propiedad del proyecto antes de permitir la reproducción o descarga.
