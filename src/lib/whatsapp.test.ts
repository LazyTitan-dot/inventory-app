import { describe, expect, it } from 'vitest';
import type { Delivery, DocumentItem, RetailDocument } from './contracts';
import { deliverySchema } from './contracts';
import { money } from './format';
import {
  buildContactWhatsAppMessage,
  buildDeliveryWhatsAppMessage,
  buildDocumentWhatsAppMessage,
  buildQuoteWhatsAppMessage,
  buildSaleReceiptWhatsAppMessage,
  buildWhatsAppUrl,
  MAX_WHATSAPP_MESSAGE_LENGTH,
  normalizeWhatsAppPhone,
} from './whatsapp';

const createdAt = '2026-09-24T15:00:00Z';
const businessName = 'Tienda QA';
const now = new Date('2026-09-24T18:00:00Z');

function document(patch: Partial<RetailDocument> = {}): RetailDocument {
  return {
    id: 'internal-document-id',
    number: 'VTA-QA-0001',
    type: 'sale',
    status: 'completed',
    contact_id: 'internal-contact-id',
    contact_snapshot: { name: 'Cliente QA', tax_id: 'private-tax-id' },
    subtotal: 1000,
    discount: 100,
    tax_rate: 18,
    tax: 162,
    total: 1062,
    currency: 'DOP',
    payment_method: 'cash',
    tendered: 1100,
    change_amount: 38,
    notes: 'private-document-note https://private.example.test/storage/sign/photo?token=secret',
    parent_id: 'internal-parent-id',
    promotion_id: 'internal-promotion-id',
    expires_at: null,
    created_by: 'internal-owner-id',
    created_at: createdAt,
    updated_at: createdAt,
    ...patch,
  };
}

function item(patch: Partial<DocumentItem> = {}): DocumentItem {
  return {
    id: 'internal-item-id',
    document_id: 'internal-document-id',
    variant_id: 'internal-variant-id',
    product_snapshot: {
      category: 'tv',
      brand: 'Marca QA',
      model: 'Modelo QA',
      name: '55 pulgadas · Negro',
      sku: 'QA-SKU-1',
      barcode: null,
      warranty_months: 12,
    },
    quantity: 2,
    received_quantity: 0,
    returned_quantity: 0,
    unit_price: 500,
    unit_cost: 654321.77,
    discount: 100,
    tax: 162,
    line_total: 1062,
    parent_item_id: 'internal-parent-item-id',
    ...patch,
  };
}

function delivery(patch: Partial<Delivery> = {}): Delivery {
  return {
    id: 'internal-delivery-id',
    sale_id: 'internal-document-id',
    status: 'scheduled',
    address: 'Dirección QA, Santo Domingo',
    phone: '8490000000',
    contact_name: 'Cliente QA',
    scheduled_at: createdAt,
    assignee: 'private-employee',
    notes: 'private-delivery-note',
    received_by: null,
    delivered_at: null,
    history: [
      { at: createdAt, actor: 'private-actor', status: 'scheduled', note: 'private-history' },
    ],
    created_at: createdAt,
    updated_at: createdAt,
    ...patch,
  };
}

describe('teléfonos y enlaces WhatsApp', () => {
  it.each([
    ['8490000000', '18490000000'],
    ['8090000000', '18090000000'],
    ['8290000000', '18290000000'],
    ['(849) 000-0000', '18490000000'],
    ['1 (809) 000-0000', '18090000000'],
    ['+1 (829) 000-0000', '18290000000'],
    ['008490000000', '8490000000'],
    ['00 1 (849) 000-0000', '18490000000'],
    ['+34 600 000 000', '34600000000'],
    ['0034 600 000 000', '34600000000'],
    ['+1234567', '1234567'],
    ['+123456789012345', '123456789012345'],
    [' 809.000.0000 ', '18090000000'],
  ])('normaliza %s sin adivinar otro país', (input, expected) => {
    expect(normalizeWhatsAppPhone(input)).toBe(expected);
  });

  it.each([
    '',
    '0000000000',
    '5550000000',
    '2120000000',
    '12120000000',
    '34600000000',
    '849000000',
    '84900000000',
    '+0123456789',
    '+123456',
    '+1234567890123456',
    '00001234567',
    '8490000000 ext 2',
    '8490000000 x2',
    '8490000000#2',
    '8490000000;2',
    '8490000000\n8090000000',
    '＋18490000000',
    '+1+8490000000',
    'https://wa.me/18490000000',
  ])('rechaza teléfonos ambiguos o inválidos: %s', (input) => {
    expect(() => normalizeWhatsAppPhone(input)).toThrow();
  });

  it('codifica acentos, saltos, emoji y caracteres de URL sin cambiar el mensaje', () => {
    const message = 'Hola, José 👋\nCotización QA: RD$1,062.00 & descuento + entrega? #1';
    const result = buildWhatsAppUrl('8490000000', message);
    const url = new URL(result);
    expect(url.origin).toBe('https://wa.me');
    expect(url.pathname).toBe('/18490000000');
    expect(url.searchParams.get('text')).toBe(message);
    expect([...url.searchParams.keys()]).toEqual(['text']);
    expect(url.hash).toBe('');
  });

  it('rechaza texto vacío, excesivo o Unicode malformado sin recortarlo silenciosamente', () => {
    expect(() => buildWhatsAppUrl('8490000000', '  ')).toThrow('Escribe el mensaje');
    expect(() =>
      buildWhatsAppUrl('8490000000', 'x'.repeat(MAX_WHATSAPP_MESSAGE_LENGTH + 1)),
    ).toThrow('3500 caracteres');
    expect(() => buildWhatsAppUrl('8490000000', '\uD800')).toThrow('carácter no válido');
    expect(
      new URL(
        buildWhatsAppUrl('8490000000', 'x'.repeat(MAX_WHATSAPP_MESSAGE_LENGTH)),
      ).searchParams.get('text'),
    ).toHaveLength(MAX_WHATSAPP_MESSAGE_LENGTH);
  });
});

describe('mensajes comerciales', () => {
  it('presenta documento, fecha de RD, variante, precio unitario y totales históricos exactos', () => {
    const message = buildSaleReceiptWhatsAppMessage({
      document: document(),
      items: [item()],
      businessName,
    });
    expect(message).toContain('Resumen de venta VTA-QA-0001');
    expect(message).toContain('Estado: Completada');
    expect(message).toContain('Cliente: Cliente QA');
    expect(message).toContain('24 sept 2026');
    expect(message).toContain('11:00');
    expect(message).toContain('(hora de RD)');
    expect(message).toContain('2 × Marca QA Modelo QA · 55 pulgadas · Negro');
    expect(message).toContain(`Precio unitario sin ITBIS: ${money(500)}`);
    expect(message).toContain(`Subtotal sin ITBIS: ${money(1000)}`);
    expect(message).toContain(`Descuento: ${money(100)}`);
    expect(message).toContain(`ITBIS registrado: ${money(162)}`);
    expect(message).toContain(`Total original de la venta: ${money(1062)}`);
    expect(message).toContain('Medio de pago registrado: Efectivo');
    expect(message).toContain('No es un comprobante fiscal');
    expect(message.toLowerCase()).not.toContain('pagada');
  });

  it('mantiene el impuesto conservado aunque difiera de una tasa histórica', () => {
    const message = buildDocumentWhatsAppMessage({
      document: document({ tax: 123.45, total: 1023.45 }),
      items: [item()],
      businessName,
    });
    expect(message).toContain(`ITBIS registrado: ${money(123.45)}`);
    expect(message).toContain(`Total original de la venta: ${money(1023.45)}`);
    expect(message).not.toContain('ITBIS (18%)');
  });

  it.each([
    ['legacy_pending', 'Pendiente de confirmar (legado)', 'no acredita un cobro'],
    ['voided', 'Anulada', 'no representa un cobro vigente'],
    ['cancelled', 'Cancelada', 'no representa un cobro vigente'],
    ['returned', 'Devuelta', 'antes de devoluciones'],
    ['partially_returned', 'Devolución parcial', 'antes de devoluciones'],
  ])(
    'no presenta %s como venta pagada ni total pendiente de cobrar',
    (status, label, explanation) => {
      const message = buildSaleReceiptWhatsAppMessage({
        document: document({ status }),
        items: [item()],
        businessName,
      });
      expect(message).toContain(`Estado: ${label}`);
      expect(message).toContain(explanation);
      expect(message.toLowerCase()).not.toMatch(/pagada|saldo pendiente|total a pagar/);
    },
  );

  it('explica la evidencia limitada del cobro histórico aun en una venta completada', () => {
    const message = buildDocumentWhatsAppMessage({
      document: document({
        legacy: { payment_evidence: 'method_only', private_key: 'private-legacy' },
      }),
      items: [item()],
      businessName,
    });
    expect(message).toContain('sin comprobante del cobro');
    expect(message).not.toContain('private-legacy');
  });

  it.each([
    ['open', '2026-09-25T18:00:00Z', 'Vigente'],
    ['open', '2026-09-24T18:00:00Z', 'Vencida'],
    ['open', '2026-09-23T18:00:00Z', 'Vencida'],
    ['cancelled', '2026-09-23T18:00:00Z', 'Cancelada'],
    ['converted', '2026-09-23T18:00:00Z', 'Convertida'],
  ])('comparte la vigencia y el estado real de cotización %s', (status, expires_at, expected) => {
    const message = buildQuoteWhatsAppMessage({
      document: document({ type: 'quote', number: 'COT-QA-0001', status, expires_at }),
      items: [item()],
      businessName,
      now,
    });
    expect(message).toContain('Cotización COT-QA-0001');
    expect(message).toContain(`Estado: ${expected}`);
    expect(message).toContain('Vigencia hasta:');
    expect(message).toContain('no reserva existencias');
    expect(message).toContain(`Total cotizado: ${money(1062)}`);
    expect(message).not.toContain('Medio de pago');
  });

  it('no filtra costos, IDs, notas, información fiscal del contacto ni partidas ajenas', () => {
    const message = buildDocumentWhatsAppMessage({
      document: document(),
      items: [
        item(),
        item({
          document_id: 'other-document',
          product_snapshot: { ...item().product_snapshot, name: 'private-other-item' },
        }),
      ],
      businessName,
    });
    expect(message).not.toMatch(/internal-|private-|secret|storage|https?:|cost[oa]|margen/i);
    expect(message).not.toContain(money(654321.77));
  });

  it('omite enlaces y referencias privadas incrustados en campos de texto públicos', () => {
    const message = buildDocumentWhatsAppMessage({
      document: document({
        contact_snapshot: {
          name: 'Cliente https://private.example.test/storage/sign?token=secret',
        },
      }),
      items: [
        item({
          product_snapshot: {
            ...item().product_snapshot,
            name: 'Color storage:private/object 11111111-1111-4111-8111-111111111111',
          },
        }),
      ],
      businessName,
    });
    expect(message).toContain('[enlace omitido]');
    expect(message).toContain('[referencia omitida]');
    expect(message).not.toMatch(/secret|storage:|11111111|https:/);
  });

  it('resume muchos artículos sin perder descuento, impuesto ni total', () => {
    const message = buildDocumentWhatsAppMessage({
      document: document(),
      items: Array.from({ length: 80 }, (_, index) => item({ id: `item-${index}` })),
      businessName,
    });
    expect(message.length).toBeLessThanOrEqual(MAX_WHATSAPP_MESSAGE_LENGTH);
    expect(message).toMatch(/Resumen: \d+ de 80 partidas\. Se omiten \d+ del detalle/);
    expect(message).toContain(`Descuento: ${money(100)}`);
    expect(message).toContain(`ITBIS registrado: ${money(162)}`);
    expect(message).toContain(`Total original de la venta: ${money(1062)}`);
    expect(message.endsWith('Documento interno. No es un comprobante fiscal.')).toBe(true);
    expect(new URL(buildWhatsAppUrl('8490000000', message)).searchParams.get('text')).toBe(message);
  });

  it('controla textos largos con emoji sin romper Unicode ni perder totales', () => {
    const message = buildDocumentWhatsAppMessage({
      document: document({ contact_snapshot: { name: '👋'.repeat(500) } }),
      items: [item({ product_snapshot: { ...item().product_snapshot, name: '🌈'.repeat(500) } })],
      businessName: '🏪'.repeat(500),
    });
    expect(message).toContain('…');
    expect(message).toContain(`Total original de la venta: ${money(1062)}`);
    expect(() => buildWhatsAppUrl('8490000000', message)).not.toThrow();
  });

  it('identifica datos ausentes y estados desconocidos sin inventar confirmación', () => {
    const message = buildDocumentWhatsAppMessage({
      document: document({
        created_at: 'invalid',
        status: 'unknown-internal-state',
        contact_snapshot: {},
      }),
      items: [],
      businessName,
    });
    expect(message).toContain('Cliente de mostrador');
    expect(message).toContain('Fecha: No registrada');
    expect(message).toContain('Estado no reconocido');
    expect(message).toContain('Detalle de partidas no disponible');
    expect(message).not.toContain('unknown-internal-state');
  });

  it('rechaza compras y devoluciones para evitar compartir costos como recibos', () => {
    for (const type of ['purchase', 'return'] as const) {
      expect(() =>
        buildDocumentWhatsAppMessage({
          document: document({ type }),
          items: [item()],
          businessName,
        }),
      ).toThrow('Solo puedes compartir');
    }
    expect(() =>
      buildQuoteWhatsAppMessage({ document: document(), items: [], businessName }),
    ).toThrow('cotización');
    expect(() =>
      buildSaleReceiptWhatsAppMessage({
        document: document({ type: 'quote' }),
        items: [],
        businessName,
      }),
    ).toThrow('venta');
  });

  it('rechaza importes no finitos sin sustituirlos por cero', () => {
    expect(() =>
      buildDocumentWhatsAppMessage({
        document: document({ total: Number.NaN }),
        items: [],
        businessName,
      }),
    ).toThrow('importe inválido');
  });
});

describe('saludos y coordinación de entregas', () => {
  it('conserva la evidencia histórica al validar la entrega recibida del servidor', () => {
    const parsed = deliverySchema.parse({
      ...delivery(),
      id: '11111111-1111-4111-8111-111111111111',
      sale_id: '22222222-2222-4222-8222-222222222222',
      history: [],
      legacy: { original_date: '2026-04-15', time_slot: 'PM (12pm–5pm)', exact_time_known: false },
    });
    expect(parsed.legacy?.exact_time_known).toBe(false);
    const message = buildDeliveryWhatsAppMessage({ delivery: parsed, businessName });
    expect(message).toContain('15 abr de 2026 · Tarde (hora exacta no registrada');
    expect(message).not.toContain('11:00');
  });

  it.each([
    ['AM (8am–12pm)', 'Mañana'],
    ['PM (12pm–5pm)', 'Tarde'],
    ['Evening (5pm–8pm)', 'Noche'],
    ['', 'Franja no registrada'],
  ])('no inventa una hora exacta para una franja histórica %s', (time_slot, expected) => {
    const message = buildDeliveryWhatsAppMessage({
      delivery: {
        ...delivery(),
        legacy: {
          original_date: '2026-04-15',
          time_slot,
          exact_time_known: false,
          id: 'private-legacy-id',
        },
      },
      businessName,
    });
    expect(message).toContain(`15 abr de 2026 · ${expected}`);
    expect(message).toContain('hora exacta no registrada en el sistema anterior');
    expect(message).not.toMatch(/11:00|private-legacy-id|8am|12pm|5pm/);
  });

  it('omite la hora aproximada si solo queda el marcador de importación en el historial', () => {
    const message = buildDeliveryWhatsAppMessage({
      delivery: delivery({
        history: [
          {
            at: createdAt,
            actor: null,
            status: 'scheduled',
            note: 'Estado declarado en el sistema anterior; receptor y autor no registrados.',
          },
        ],
      }),
      businessName,
    });
    expect(message).toContain('hora exacta no registrada');
    expect(message).not.toContain('11:00');
  });

  it.each([
    ['2026-04-16T15:30:00Z', '16 abr 2026', '11:30'],
    ['2026-04-15T13:30:00Z', '15 abr 2026', '9:30'],
  ])('usa la cita actual tras una reprogramación autenticada a %s', (scheduled_at, day, time) => {
    const message = buildDeliveryWhatsAppMessage({
      delivery: delivery({
        scheduled_at,
        legacy: {
          original_date: '2026-04-15',
          time_slot: 'AM (8am–12pm)',
          exact_time_known: false,
        },
        history: [
          {
            at: createdAt,
            actor: 'internal-actor',
            status: 'scheduled',
            note: 'Entrega reprogramada',
          },
        ],
      }),
      businessName,
    });
    expect(message).toContain(day);
    expect(message).toContain(time);
    expect(message).toContain('(hora de RD)');
    expect(message).not.toContain('hora exacta no registrada');
    expect(message).not.toContain('internal-actor');
  });

  it('un cambio de estado sin cambio de fecha no transforma la hora aproximada en una cita', () => {
    const message = buildDeliveryWhatsAppMessage({
      delivery: delivery({
        scheduled_at: '2026-04-15T12:00:00Z',
        legacy: {
          original_date: '2026-04-15',
          time_slot: 'AM (8am–12pm)',
          exact_time_known: false,
        },
        history: [
          {
            at: createdAt,
            actor: 'internal-actor',
            status: 'scheduled',
            note: 'Entrega reprogramada',
          },
        ],
      }),
      businessName,
    });
    expect(message).toContain('Mañana (hora exacta no registrada');
    expect(message).not.toContain('8:00');
  });

  it('respeta metadata que confirma una hora exacta aunque conserve historia importada', () => {
    const message = buildDeliveryWhatsAppMessage({
      delivery: delivery({
        legacy: { original_date: '2026-04-15', time_slot: 'AM', exact_time_known: true },
        history: [
          {
            at: createdAt,
            actor: null,
            status: 'scheduled',
            note: 'Estado declarado en el sistema anterior; receptor y autor no registrados.',
          },
        ],
      }),
      businessName,
    });
    expect(message).toContain('11:00');
    expect(message).toContain('hora de RD');
    expect(message).not.toContain('hora exacta no registrada');
  });

  it('crea saludos sin compartir la ficha privada del contacto', () => {
    const contact = {
      name: 'Cliente QA',
      kind: 'customer' as const,
      notes: 'private-notes',
      email: 'private-email',
      id: 'internal-contact',
    };
    const message = buildContactWhatsAppMessage({ contact, businessName });
    expect(message).toBe('Hola, Cliente QA. Te escribimos de Tienda QA. ¿Cómo podemos ayudarte?');
    expect(
      buildContactWhatsAppMessage({
        contact: { name: 'Proveedor QA', kind: 'supplier' },
        businessName,
      }),
    ).toContain('coordinar una compra');
  });

  it('comparte fecha, dirección, referencia pública y variantes sin datos internos ni importes', () => {
    const message = buildDeliveryWhatsAppMessage({
      delivery: delivery(),
      sale: document(),
      items: [item()],
      businessName,
    });
    expect(message).toContain('Entrega de la venta VTA-QA-0001');
    expect(message).toContain('Estado de entrega: Programada');
    expect(message).toContain('Estado de venta: Completada');
    expect(message).toContain('Dirección QA, Santo Domingo');
    expect(message).toContain('(hora de RD)');
    expect(message).toContain('2 × Marca QA Modelo QA · 55 pulgadas · Negro');
    expect(message).not.toMatch(/private-|internal-|RD\$|costo|margen/);
  });

  it.each([
    ['scheduled', 'Programada', 'Confírmanos si podrás recibir'],
    ['in_transit', 'En camino', 'Tu entrega está en camino'],
    ['delivered', 'Entregada', 'figura como entregada'],
    ['failed', 'No entregada', 'No se completó'],
    ['cancelled', 'Cancelada', 'está cancelada'],
  ] as const)('describe %s sin prometer una entrega en otro estado', (status, label, closing) => {
    const message = buildDeliveryWhatsAppMessage({ delivery: delivery({ status }), businessName });
    expect(message).toContain(`Estado de entrega: ${label}`);
    expect(message).toContain(closing);
    if (status !== 'scheduled') expect(message).not.toContain('Confírmanos si podrás recibir');
  });

  it('no comparte una venta no vinculada y muestra la evidencia de entrega registrada', () => {
    const message = buildDeliveryWhatsAppMessage({
      delivery: delivery({
        status: 'delivered',
        delivered_at: createdAt,
        received_by: 'Persona QA',
      }),
      sale: document({ id: 'other-sale', number: 'PRIVATE-OTHER-SALE' }),
      items: [item()],
      businessName,
    });
    expect(message).not.toContain('PRIVATE-OTHER-SALE');
    expect(message).not.toContain('55 pulgadas');
    expect(message).toContain('Recibió: Persona QA');
    expect(message).toContain('Entregada el:');
  });

  it('limita una entrega extensa sin omitir el estado ni la instrucción final', () => {
    const message = buildDeliveryWhatsAppMessage({
      delivery: delivery({ address: 'Dirección QA '.repeat(100), status: 'failed' }),
      sale: document(),
      items: Array.from({ length: 100 }, () => item()),
      businessName,
    });
    expect(message.length).toBeLessThanOrEqual(MAX_WHATSAPP_MESSAGE_LENGTH);
    expect(message).toMatch(/Resumen: \d+ de 100 partidas/);
    expect(message).toContain('Estado de entrega: No entregada');
    expect(
      message.endsWith('No se completó la entrega. Escríbenos para coordinar el próximo paso.'),
    ).toBe(true);
  });
});
