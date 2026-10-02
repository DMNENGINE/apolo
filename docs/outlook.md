# Conectar Outlook / Hotmail

Microsoft ya no deja entrar al correo de Outlook, Hotmail, Live o MSN con contraseña desde otras apps. Hay que iniciar sesión con Microsoft. Para eso, APOLO necesita el **"Application (client) ID"** de una app registrada en Azure. Es gratis y solo se hace una vez.

> Si alguien ya te pasó un client ID, salta al paso 4.

## 1. Registrar la app

1. Entra en <https://entra.microsoft.com> → **Applications → App registrations → New registration**. Sirve cualquier cuenta de Microsoft.
2. **Name:** `APOLO`.
3. **Supported account types:** *Accounts in any organizational directory and personal Microsoft accounts*.
4. **Redirect URI:** déjalo vacío.
5. **Register**.

## 2. Permitir el inicio con código

En la app: **Authentication → Advanced settings → Allow public client flows → Yes → Save**.

## 3. Permisos

**API permissions → Add a permission → APIs my organization uses**. Busca **Office 365 Exchange Online** (o usa *Microsoft Graph* si no aparece) → **Delegated permissions** y marca:

- `IMAP.AccessAsUser.All`
- `SMTP.Send`

Después: **Add permissions**. Las cuentas personales no necesitan "admin consent".

## 4. Pegar el ID en APOLO

Copia el **Application (client) ID** desde **Overview** y pégalo en **Panel → Configuración → Correo y servicios → Client ID de Microsoft → Guardar**.

Luego pulsa **Añadir correo** y escribe tu correo de Outlook. APOLO te mostrará un código. Escríbelo en <https://microsoft.com/devicelogin>, inicia sesión y listo.

También se puede poner con la variable de entorno `APOLO_MS_CLIENT_ID`.
