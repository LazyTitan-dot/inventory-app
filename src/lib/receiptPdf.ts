/**
 * Create a local, multipage PDF from the displayed commercial receipt.
 * Canvas preserves Spanish/Unicode text and the exact official PNG logo. Each
 * page is encoded as a 2x-resolution JPEG; no customer data leaves the device.
 * A small PDF 1.4 image writer avoids adding a network-loaded dependency.
 */
const PAGE_W = 595, PAGE_H = 842, SCALE = 2, MARGIN = 42;
const utf8 = new TextEncoder();
const bytes = (s: string) => utf8.encode(s);

function assemblePdf(images: Uint8Array[], width: number, height: number): Blob {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const offsets = [0];
  let offset = 0;
  const append = (chunk: string | Uint8Array) => {
    const part = typeof chunk === 'string' ? bytes(chunk) : new Uint8Array(chunk);
    chunks.push(part); offset += part.byteLength;
  };
  function obj(id: number, content: string, stream?: Uint8Array) {
    offsets[id] = offset;
    append(`${id} 0 obj\n${content}`);
    if (stream) { append('\nstream\n'); append(stream); append('\nendstream'); }
    append('\nendobj\n');
  }
  append('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  const kids = images.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(2, `<< /Type /Pages /Count ${images.length} /Kids [${kids}] >>`);
  images.forEach((image, i) => {
    const page = 3 + i * 3, bitmap = page + 1, contents = page + 2;
    obj(page, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /XObject << /Im0 ${bitmap} 0 R >> >> /Contents ${contents} 0 R >>`);
    obj(bitmap, `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.byteLength} >>`, image);
    const drawing = bytes(`q\n${PAGE_W} 0 0 ${PAGE_H} 0 0 cm\n/Im0 Do\nQ\n`);
    obj(contents, `<< /Length ${drawing.byteLength} >>`, drawing);
  });
  const xref = offset;
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (const entry of offsets.slice(1)) append(`${String(entry).padStart(10, '0')} 00000 n \n`);
  append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}

const displayed = (node: Element | null | undefined) =>
  node instanceof HTMLElement ? node.innerText.trim() : node?.textContent?.trim() || '';

function wrapped(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let current = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= width) { current = candidate; continue; }
      if (current) { lines.push(current); current = ''; }
      for (const glyph of Array.from(word)) {
        if (current && ctx.measureText(current + glyph).width > width) {
          lines.push(current); current = '';
        }
        current += glyph;
      }
    }
    lines.push(current);
  }
  return lines;
}
function jpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (!blob) { reject(new Error('PDF image encoding failed')); return; }
    void blob.arrayBuffer().then(value => resolve(new Uint8Array(value)), reject);
  }, 'image/jpeg', .94));
}

export async function createReceiptPdf(receipt: HTMLElement, number: string): Promise<Blob> {
  const logo = receipt.querySelector<HTMLImageElement>('.sales-receipt-logo');
  if (!logo) throw new Error('Receipt logo missing');
  await logo.decode();
  if (!logo.naturalWidth || !logo.naturalHeight) throw new Error('Receipt logo unavailable');

  const heading = receipt.querySelector('.commerce-document-heading');
  const contact = receipt.querySelector('.commerce-document-contact');
  const table = receipt.querySelector('table');
  const totals = receipt.querySelector('.commerce-totals');
  if (!heading || !contact || !table || !totals) throw new Error('Incomplete receipt');

  // Snapshot all the values before awaiting page encodes; amounts are never recalculated.
  const title = displayed(heading.querySelector('h2'));
  const date = displayed(heading.querySelector('p'));
  const status = displayed(heading.lastElementChild);
  const context = Array.from(receipt.querySelectorAll('.commerce-inline-note')).map(displayed);
  const contacts = Array.from(contact.children).map(displayed);
  const columns = Array.from(table.querySelectorAll('thead th')).map(displayed);
  const rows = Array.from(table.querySelectorAll('tbody tr')).map(row => Array.from(row.children).map(displayed));
  const totalRows = Array.from(totals.children).map(row => Array.from(row.children).map(displayed));
  const notes = displayed(receipt.querySelector('.commerce-document-notes'));

  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W * SCALE; canvas.height = PAGE_H * SCALE;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.scale(SCALE, SCALE);
  const images: Uint8Array[] = [];
  let y = MARGIN, page = 0;
  const contentWidth = PAGE_W - 2 * MARGIN;
  const ink = '#102b4a', muted = '#526982';
  function begin() {
    page++;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    const ratio = Math.min(190 / logo!.naturalWidth, 68 / logo!.naturalHeight);
    const w = logo!.naturalWidth * ratio, h = logo!.naturalHeight * ratio;
    ctx.drawImage(logo!, MARGIN, MARGIN, w, h);
    y = MARGIN + h + 16;
    ctx.fillStyle = ink; ctx.font = '700 20px Arial, sans-serif'; ctx.fillText(title || 'Recibo de venta', MARGIN, y + 20);
    y += 36;
    ctx.font = '11px Arial, sans-serif'; ctx.fillStyle = muted;
    for (const line of wrapped(ctx, date || number, contentWidth)) {
      ctx.fillText(line, MARGIN, y + 11); y += 15;
    }
    ctx.strokeStyle = '#d7e5f5'; ctx.beginPath(); ctx.moveTo(MARGIN, y + 5); ctx.lineTo(PAGE_W - MARGIN, y + 5); ctx.stroke();
    y += 20;
  }
  async function finish() {
    ctx.font = '10px Arial, sans-serif'; ctx.fillStyle = muted;
    ctx.fillText(`Página ${page} · ${number}`, MARGIN, PAGE_H - 24);
    images.push(await jpeg(canvas));
  }
  async function space(height: number) {
    if (y + height > PAGE_H - MARGIN) { await finish(); begin(); }
  }
  async function paragraph(text: string, bold = false, size = 11, color = ink) {
    if (!text) return;
    const font = `${bold ? '700' : '400'} ${size}px Arial, sans-serif`;
    ctx.font = font;
    const lines = wrapped(ctx, text, contentWidth);
    const lineHeight = size + 5;
    for (const line of lines) {
      await space(lineHeight);
      ctx.font = font; ctx.fillStyle = color;
      ctx.fillText(line, MARGIN, y + size);
      y += lineHeight;
    }
    y += 6;
  }
  async function section(name: string) {
    await space(42);
    y += 8; await paragraph(name, true, 13, ink);
  }
  begin();
  await paragraph(status, false, 11, muted);
  for (const note of context) await paragraph(note, false, 11, muted);
  for (const group of contacts) await paragraph(group);
  await section('Artículos');
  for (const row of rows) {
    await space(60);
    await paragraph(row[0] || 'Artículo', true);
    for (let i = 1; i < row.length; i++) await paragraph(`${columns[i] || 'Importe'}: ${row[i]}`);
    y += 5;
  }
  if (!rows.length) await paragraph('Detalle de artículos no disponible.');
  await section('Resumen de la venta');
  for (const row of totalRows) await paragraph(row.join(': '), row[0] === 'Total', row[0] === 'Total' ? 15 : 11);
  if (notes) { await section('Información del recibo'); await paragraph(notes, false, 10, muted); }
  await finish();
  return assemblePdf(images, canvas.width, canvas.height);
}
