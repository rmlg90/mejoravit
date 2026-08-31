# Portal Mejoravit HTML — versión de prueba

Interfaz web estática y responsive para probar un flujo más completo:

1. Datos básicos del prospecto.
2. Carga de PDF o imagen.
3. Extracción en navegador (PDF.js) y OCR de respaldo (Tesseract.js).
4. Revisión editable y validación de la tabla.
5. Comparativo visual y generación de PDF (jsPDF).

## Privacidad de esta versión

Por defecto **no existe backend ni base de datos**. El archivo del prospecto se procesa dentro del navegador y no se guarda en GitHub ni en un servidor de esta app.

Las librerías JavaScript se cargan desde CDN. El documento no se envía a esos CDN; se utiliza localmente en el navegador.

## Archivos

- `index.html`: interfaz principal.
- `assets/styles.css`: diseño responsive.
- `assets/app.js`: lectura, OCR, validación y PDF.
- `assets/config.js`: parámetros sencillos del portal.

## Parámetros actuales de prueba

En `assets/config.js`:

```js
commissionRate: 0.24,
fixedFee: 2000,
webhookUrl: ""
```

Confirma esos honorarios antes de usar la herramienta con clientes reales.

## Cómo probar localmente

Puedes abrir `index.html` directamente. Para evitar restricciones del navegador con PDF.js, lo ideal es servir la carpeta con un servidor estático (por ejemplo Live Server de VS Code) o desplegarla en un hosting estático.

## GitHub

Sube **el contenido** de esta carpeta a un repositorio. Para publicarlo como sitio estático puedes usar GitHub Pages si está disponible para tu repositorio/plan, o cualquier hosting estático conectado a GitHub.

## Antes de usar con clientes reales

- Confirmar honorarios y textos legales.
- Probar con diferentes formatos reales de PDF de INFONAVIT.
- Definir si los datos del prospecto se enviarán a CRM/Google Sheets/webhook.
- Agregar aviso de privacidad formal y consentimiento conforme al flujo real.
- Si se configura un webhook, revisar seguridad y minimización de datos.

## Nota

Herramienta independiente para simulación informativa. No es un sitio oficial de INFONAVIT.
