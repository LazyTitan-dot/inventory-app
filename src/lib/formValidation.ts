type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function validationMessage(
  validity: ValidityState,
  field: {
    type: string;
    min: string;
    max: string;
    minLength: number;
    maxLength: number;
    step: string;
  },
): string {
  if (validity.valueMissing) return 'Completa este campo para continuar.';
  if (validity.typeMismatch)
    return field.type === 'email'
      ? 'Escribe un correo electrónico válido.'
      : 'Escribe una dirección web válida.';
  if (validity.badInput) return 'Escribe un número válido.';
  if (validity.rangeUnderflow) return `El valor debe ser igual o mayor que ${field.min}.`;
  if (validity.rangeOverflow) return `El valor debe ser igual o menor que ${field.max}.`;
  if (validity.tooShort) return `Escribe al menos ${field.minLength} caracteres.`;
  if (validity.tooLong) return `Usa como máximo ${field.maxLength} caracteres.`;
  if (validity.stepMismatch)
    return field.step === '1'
      ? 'Escribe una cantidad entera, sin decimales.'
      : 'Revisa los decimales de este valor.';
  if (validity.patternMismatch) return 'Revisa el formato de este campo.';
  return 'Revisa este campo para continuar.';
}

export function installSpanishValidation() {
  const control = (target: EventTarget | null): target is Control =>
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement;
  const invalid = (event: Event) => {
    if (!control(event.target)) return;
    const field = event.target;
    // The browser language may differ from the app language. Keep native focus
    // and submission blocking, while providing our own Spanish explanation.
    field.setCustomValidity('');
    field.setCustomValidity(
      validationMessage(field.validity, {
        type: field.type,
        min: field.getAttribute('min') ?? '',
        max: field.getAttribute('max') ?? '',
        minLength: Number(field.getAttribute('minlength')),
        maxLength: Number(field.getAttribute('maxlength')),
        step: field.getAttribute('step') ?? '',
      }),
    );
  };
  const clear = (event: Event) => {
    if (control(event.target)) event.target.setCustomValidity('');
  };
  document.addEventListener('invalid', invalid, true);
  document.addEventListener('input', clear, true);
  document.addEventListener('change', clear, true);
  return () => {
    document.removeEventListener('invalid', invalid, true);
    document.removeEventListener('input', clear, true);
    document.removeEventListener('change', clear, true);
  };
}
