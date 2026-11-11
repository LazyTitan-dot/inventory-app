import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WhatsAppComposer } from './WhatsAppComposer';

function render(phone: string, message = 'Hola, tu pedido está listo.') {
  return renderToStaticMarkup(
    <WhatsAppComposer
      title="Mensaje al cliente"
      contactName="Cliente de prueba"
      phone={phone}
      message={message}
      onClose={() => undefined}
    />,
  );
}

describe('Revisión del mensaje de WhatsApp', () => {
  it('permite revisar el destinatario y evita indicar que se envió un mensaje', () => {
    const html = render('8490000000');
    expect(html).toContain('https://wa.me/18490000000?text=');
    expect(html).toContain('Destino:');
    expect(html).toContain('noopener noreferrer');
    expect(html).toContain('Esta vista no confirma su envío ni su entrega.');
    expect(html).toContain('Enviar por WhatsApp');
    expect(html).toContain('sin copiar y');
    expect(html).not.toContain('Copiar mensaje');
    expect(html).not.toContain('Mensaje enviado');
  });

  it('prepares the complete editable message directly in the chat link', () => {
    const message = 'S-Mart Living\nPuedes escribirnos por este mismo chat para cualquier consulta o cambio.';
    const html = render('8490000000', message);
    const href = html.match(/href="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
    expect(href).toBeDefined();
    expect(new URL(href!).searchParams.get('text')).toBe(message);
    expect(html).toContain('<textarea');
    expect(html).not.toContain('readonly');
  });

  it.each(['', '849', 'cliente@example.test', '2025550123', '+1<script>8490000000'])(
    'no construye un enlace para el destinatario inválido %s',
    (phone) => {
      expect(render(phone)).not.toContain('href="https://wa.me/');
    },
  );

  it('bloquea mensajes vacíos o demasiado largos sin enviar un texto truncado', () => {
    expect(render('8490000000', '   ')).not.toContain('href="https://wa.me/');
    expect(render('8490000000', 'x'.repeat(3501))).not.toContain('href="https://wa.me/');
  });
});
