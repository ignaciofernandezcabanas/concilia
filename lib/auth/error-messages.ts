export function getAuthErrorMessage(raw: string): string {
  const map: Record<string, string> = {
    "Invalid login credentials": "Email o contraseña incorrectos.",
    "Email not confirmed": "Debes confirmar tu email antes de iniciar sesión.",
    "User already registered": "Ya existe una cuenta con este email.",
    "Password should be at least": "La contraseña debe tener al menos 8 caracteres.",
    "Unable to validate email address": "El formato del email no es válido.",
    "Email rate limit exceeded": "Demasiados intentos. Espera unos minutos.",
    "For security purposes, you can only request this after":
      "Demasiados intentos. Espera unos minutos.",
    "Signups not allowed": "El registro no está disponible en este momento.",
    "User not found": "No existe una cuenta con este email.",
    "Too many requests": "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.",
  };
  for (const [key, msg] of Object.entries(map)) {
    if (raw.includes(key)) return msg;
  }
  return "Ha ocurrido un error. Inténtalo de nuevo.";
}
