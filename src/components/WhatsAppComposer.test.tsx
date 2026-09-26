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
    expect(html).not.toContain('Mensaje enviado');
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
