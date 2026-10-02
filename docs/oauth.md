# Registrar las apps OAuth (Google y Microsoft)

Los botones **Conectar con Google** y **Conectar con Microsoft** de APOLO usan dos apps registradas a nombre del mantenedor. Se hace **una vez**. Después, cada usuario solo pulsa el botón e inicia sesión.

Las credenciales se pegan en **Panel → Configuración → Correo y servicios → Credenciales OAuth**. También se pueden poner con las variables de entorno `APOLO_GOOGLE_CLIENT_ID`, `APOLO_GOOGLE_CLIENT_SECRET` y `APOLO_MS_CLIENT_ID`.

---

## Google (Gmail)

1. Entra en <https://console.cloud.google.com> → **Crear proyecto** → nombre `APOLO`.
2. **APIs y servicios → Biblioteca** → busca **Gmail API** → **Habilitar**.
3. **Google Auth Platform** (o *Pantalla de consentimiento de OAuth*):
   - **Información de la marca:** nombre `APOLO`, tu correo de asistencia y el logo si quieres.
   - **Público:** *Externo*. Déjalo en **Pruebas** y añade en **Usuarios de prueba** los correos que van a usar APOLO (hasta 100).
   - **Acceso a los datos → Añadir permisos:** `https://mail.google.com/`.
4. **Clientes → Crear cliente** → tipo **App de escritorio** → nombre `APOLO desktop` → **Crear**.
5. Copia el **ID de cliente** y el **secreto del cliente** en el panel de APOLO.

**Sobre el modo Pruebas:**
- Mientras esté en Pruebas, solo pueden conectarse los usuarios de prueba que añadiste, y Google muestra "Google no ha verificado esta app": se pulsa *Continuar*.
- Además, en Pruebas la sesión de esas cuentas caduca a los **7 días** y hay que pulsar **Reconectar**.
- Para quitar estos límites hay que pedir la **verificación** de Google. Con el permiso de Gmail completo eso incluye una auditoría de seguridad de pago (CASA).

> En apps de escritorio, Google no considera secreto el "client secret". Se puede incluir en la app publicada.

---

## Microsoft (Outlook, Hotmail, Live, MSN)

1. Entra en <https://entra.microsoft.com> → **Applications → App registrations → New registration**.
   - **Name:** `APOLO`.
   - **Supported account types:** *Accounts in any organizational directory and personal Microsoft accounts*.
   - **Redirect URI:** plataforma **Public client/native (mobile & desktop)** con valor `http://localhost`.
   - **Register**.
2. **Authentication → Advanced settings → Allow public client flows → Yes → Save**.
3. **API permissions → Add a permission → APIs my organization uses → Office 365 Exchange Online → Delegated**:
   - `IMAP.AccessAsUser.All`
   - `SMTP.Send`
4. Copia el **Application (client) ID** (en *Overview*) en el panel de APOLO. Microsoft no necesita secreto.

Las cuentas personales (Outlook.com, Hotmail) no necesitan aprobación de administrador. Las de empresa pueden necesitarla, según la configuración de su organización.
