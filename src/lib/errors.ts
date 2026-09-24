export function errorMessage(error: unknown): string {
  if (!navigator.onLine)
    return 'No hay conexión a internet. Tus datos del formulario siguen aquí. Comprueba la conexión y vuelve a intentar.';
  if (typeof error !== 'object' || error === null)
    return 'No pudimos completar la operación. Vuelve a intentar.';
  const e = error as { code?: string; message?: string; name?: string };
  if (e.code === '42501')
    return 'Tu cuenta no tiene permiso para realizar esta acción. Consulta con el administrador.';
  if (e.code === '23505')
    return 'Este registro ya existe. Revisa el SKU, el código de barras o la identificación.';
  if (e.code === '23503')
    return 'El registro está relacionado con otra operación y no se puede modificar de esta manera.';
  if (e.code === '23514' || e.code === '22P02')
    return 'Hay un valor que no es válido. Revisa las cantidades, los importes y los campos obligatorios.';
  if (e.code === 'PGRST301' || e.code === 'PGRST303')
    return 'La sesión ha vencido. Inicia sesión nuevamente.';
  if (e.code === 'P0001' && e.message && e.message.length < 400) return e.message;
  if (e.message === 'Invalid login credentials')
    return 'El correo o la contraseña no son correctos.';
  if (e.message === 'Email not confirmed') return 'Confirma tu correo antes de iniciar sesión.';
  if (e.message?.includes('rate limit'))
    return 'Hay demasiados intentos. Espera unos minutos antes de volver a intentar.';
  if (e.name === 'TypeError' || e.message?.includes('fetch'))
    return 'No pudimos confirmar la respuesta del servidor. Vuelve a intentar; conservaremos el identificador de esta operación para evitar duplicados.';
  return 'No pudimos completar la operación. Conservamos el formulario para que puedas volver a intentar.';
}
