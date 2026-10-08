# Configurar "Continuar con Google"

El código ya está listo (botón, callback). Falta exclusivamente crear credenciales en
Google Cloud y pegarlas en el panel de Supabase. Ninguna clave va en el repositorio
ni en el chat.

## 1. Google Cloud Console

1. Cree o seleccione un proyecto en [console.cloud.google.com](https://console.cloud.google.com).
2. **APIs y servicios → Pantalla de consentimiento OAuth**: configure el tipo (Externo
   está bien para pruebas), nombre de la app "PACTO" y su correo de contacto.
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**.
   - Tipo de aplicación: **Aplicación web**.
   - **URI de redirección autorizados**, agregue exactamente:
     ```
     https://qmfwilyarxnomyufnwwv.supabase.co/auth/v1/callback
     ```
     Esta es la URL de callback de Supabase, no la de PACTO. Es la misma para
     Preview y para producción: Supabase reenvía internamente a `/auth/callback`
     de PACTO usando las URLs ya configuradas en **Authentication → URL
     Configuration**.
4. Guarde y copie el **ID de cliente** y el **Secreto de cliente**.

## 2. Panel de Supabase

1. Vaya a `supabase.com/dashboard/project/qmfwilyarxnomyufnwwv/auth/providers`.
2. Abra la fila **Google** y actívela.
3. Pegue el ID de cliente y el secreto **directamente ahí**, no en ningún otro
   lugar. Guarde.

## 3. Verificación

Con Google habilitado, el botón "Continuar con Google" en `/sign-in` y `/sign-up`
funcionará sin cambios de código. Pruebe iniciando sesión con una cuenta de Google
real; debe terminar en `/pactos` con una sesión activa.

## Estado actual

Google está **deshabilitado** en el proyecto: no hay credenciales configuradas. El
registro y el inicio de sesión con correo y contraseña funcionan sin este paso.
