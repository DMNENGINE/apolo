---
name: diseno-formularios-acceso
description: Formularios y acceso - login, registro, recuperar contraseña, verificación por código (OTP), passkeys/biometría, perfiles y cualquier formulario con validación. Úsala al diseñar o maquetar pantallas de inicio de sesión, alta de cuenta o formularios.
license: MIT
metadata:
  apolo:
    version: 1.0.0
    autor: DMN / APOLO
    disparadores: [login, inicio de sesión, iniciar sesión, sign in, sign up, registro, registrarse, crear cuenta, contraseña, password, formulario, form, otp, código de verificación, passkey, biometría, face id]
---

# Formularios, login y registro

## Principios de cualquier formulario
- **Pide lo mínimo.** Cada campo cuesta conversiones; lo opcional, para después.
- **Una columna.** Etiqueta **encima** del campo, siempre visible. El placeholder solo da un ejemplo de formato.
- Campos del ancho de lo que esperan (código postal corto, email largo). Agrupa en secciones con título si hay más de 6–7 campos.
- **Teclado y autocompletado correctos** (en web, atributos `type`, `inputmode` y `autocomplete`):
  - email → `type="email" autocomplete="email"`
  - contraseña actual → `autocomplete="current-password"`; nueva → `autocomplete="new-password"`
  - código SMS → `inputmode="numeric" autocomplete="one-time-code"`
  - teléfono → `type="tel" autocomplete="tel"`; nombre, dirección y tarjeta con sus valores `autocomplete` estándar
- **Validación:** al salir del campo (on blur), no con cada tecla. Lo correcto se marca discretamente y el error se explica junto al campo: qué pasa y cómo arreglarlo ("La contraseña necesita 8 caracteres; te faltan 3").
- **Botón de enviar siempre activo**: al pulsarlo, enfoca el primer error. Un botón gris sin explicación frustra.
- Nunca borres lo escrito tras un error. Guarda borradores en formularios largos.
- Estado de envío: el botón cambia a "Entrando…" con un spinner y no admite doble clic.

## Login
Estructura habitual, de arriba abajo:
1. Logo o nombre y un título breve ("Hola de nuevo").
2. **Métodos rápidos primero** si existen: passkey / Face ID / Touch ID, "Continuar con Apple/Google".
3. Separador "o", luego email + contraseña.
4. Mostrar/ocultar contraseña (icono de ojo con etiqueta accesible).
5. Botón primario ancho ("Iniciar sesión") y, debajo, "¿Olvidaste tu contraseña?" como enlace.
6. Abajo del todo: "¿No tienes cuenta? Crear cuenta".

Además:
- **Permite pegar** y los gestores de contraseñas. Sin captchas de puzzle si hay alternativa.
- Mensaje de error genérico por seguridad ("Email o contraseña incorrectos"), pero útil: ofrece el enlace para recuperarla.
- Biometría como **opción** y después del primer login, explicando qué hace.
- "Mantener sesión iniciada" activado por defecto en móvil propio; en apps sensibles (banca), bloqueo con biometría al volver.

## Registro
- Opciones sociales o passkey arriba, email debajo.
- Contraseña nueva: **requisitos visibles desde el principio** y que se marcan al cumplirse; medidor de fuerza opcional. Nada de "repite la contraseña" si hay mostrar/ocultar.
- Términos: texto con enlaces junto al botón ("Al crear la cuenta aceptas…"). Usa una casilla solo si legalmente hace falta, y nunca marcada de antemano para el marketing.
- Si el alta es larga (KYC, banca): pantalla previa con **qué vas a necesitar** (documento, 5 minutos) y un **indicador de progreso** ("Paso 2 de 4").
- Verificación de email que no bloquee: deja entrar y recuerda verificar.

## Código de verificación (OTP)
- Campo único que acepta pegar el código entero (o casillas que pegan bien), con autocompletado del SMS.
- Avanza solo al completar los dígitos. "Reenviar código" con cuenta atrás visible (por ejemplo 30 s).
- Dice a dónde se envió ("a ••••42") y ofrece cambiar el número.

## Recuperar contraseña
1. Email → "Si existe una cuenta, te enviamos un enlace" (sin revelar si existe).
2. Enlace → nueva contraseña con los requisitos visibles → **entra directamente** al terminar.

## Errores típicos
- Placeholder como única etiqueta.
- Validar mientras se escribe ("email inválido" a la segunda letra).
- Requisitos de contraseña que solo aparecen al fallar.
- Bloquear pegar.
- Dos botones primarios ("Entrar" y "Registrarse" iguales).
- Pedir teléfono, fecha de nacimiento y género en el registro sin necesidad.
