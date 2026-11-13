import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StartupScreen } from './StartupScreen';

describe('branded startup screen', () => {
  it.each([
    ['Abriendo tu espacio de trabajo', 'Comprobando tu sesión…'],
    ['Preparando tu tienda', 'Estamos cargando tus productos, operaciones y permisos.'],
  ])('uses the approved icon and accessible loading status for %s', (title, message) => {
    const html = renderToStaticMarkup(<StartupScreen title={title} message={message} />);
    expect(html).toContain('/icons/s-mart-living-v2-180.png');
    expect(html).toContain('S-Mart Living');
    expect(html).toContain('role="status"');
    expect(html).toContain('sl-startup-progress');
    expect(html).toContain(message);
    expect(html).not.toContain('brand-mark');
  });
  it('keeps error actions accessible without suggesting work is still loading', () => {
    const html = renderToStaticMarkup(<StartupScreen title="Error" message="No disponible" failed><button>Volver a intentar</button></StartupScreen>);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Volver a intentar');
    expect(html).not.toContain('sl-startup-progress');
  });
});
