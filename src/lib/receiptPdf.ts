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

  // Read the exact document values once. This is a print layout, not a recalculation.
  const title = displayed(heading.querySelector('h2')) || 'Recibo de venta';
  const date = displayed(heading.querySelector('p')) || number;
  const status = displayed(heading.lastElementChild);
  const context = Array.from(receipt.querySelectorAll('.commerce-inline-note')).map(displayed);
  const contacts = Array.from(contact.children).map(group =>
    Array.from(group.children).map(displayed).filter(Boolean));
  const columns = Array.from(table.querySelectorAll('thead th')).map(displayed);
  const rows = Array.from(table.querySelectorAll('tbody tr')).map(row =>
    Array.from(row.children).map(displayed));
  const totalRows = Array.from(totals.children).map(row =>
    Array.from(row.children).map(displayed));
  const notes = displayed(receipt.querySelector('.commerce-document-notes'));

  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W * SCALE;
  canvas.height = PAGE_H * SCALE;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'top';

  const images: Uint8Array[] = [];
  const contentWidth = PAGE_W - MARGIN * 2;
  const bottom = PAGE_H - MARGIN - 28;
  const ink = '#152641';
  const muted = '#526982';
  const edge = '#dce5ee';
  const light = '#f2f6fa';
  const edges = [MARGIN, MARGIN + 212, MARGIN + 273, MARGIN + 389, PAGE_W - MARGIN];
  let y = MARGIN;
  let page = 0;

  const linesFor = (value: string, font: string, maxWidth: number) => {
    ctx.font = font;
    return wrapped(ctx, value, maxWidth).filter(line => line.length > 0);
  };
  function paint(lines: string[], x: number, top: number, font: string,
    color: string, lineHeight: number, right = false) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = right ? 'right' : 'left';
    lines.forEach((line, i) => ctx.fillText(line, x, top + i * lineHeight));
    ctx.textAlign = 'left';
  }
  function beginPage() {
    page++;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    const ratio = Math.min(242 / logo.naturalWidth, 83 / logo.naturalHeight);
    const logoWidth = logo.naturalWidth * ratio;
    const logoHeight = logo.naturalHeight * ratio;
    ctx.drawImage(logo, MARGIN, MARGIN, logoWidth, logoHeight);

    y = MARGIN + logoHeight + 16;
    paint([title], MARGIN, y, '700 20px Arial, sans-serif', ink, 24);
    paint([status], PAGE_W - MARGIN, y + 5, '10px Arial, sans-serif', muted, 12, true);
    y += 30;
    const dateLines = linesFor(page === 1 ? date : date + ' · Continuación',
      '11px Arial, sans-serif', contentWidth);
    paint(dateLines, MARGIN, y, '11px Arial, sans-serif', muted, 15);
    y += dateLines.length * 15 + 16;
    ctx.strokeStyle = edge;
    ctx.beginPath();
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(PAGE_W - MARGIN, y);
    ctx.stroke();
    y += 18;
  }
  async function finishPage() {
    paint(['Página ' + page + ' · ' + number], MARGIN, PAGE_H - 26,
      '10px Arial, sans-serif', muted, 12);
    images.push(await jpeg(canvas));
  }
  async function ensureRoom(height: number, repeatTable = false) {
    if (y + height <= bottom) return;
    await finishPage();
    beginPage();
    if (repeatTable) drawTableHeader();
  }
  function drawTableHeader() {
    const h = 45;
    ctx.fillStyle = light;
    ctx.fillRect(MARGIN, y, contentWidth, h);
    columns.slice(0, 4).forEach((label, index) => {
      const font = '700 9px Arial, sans-serif';
      const right = index > 0;
      const available = edges[index + 1] - edges[index] - 16;
      const lines = linesFor(label, font, available);
      paint(lines, right ? edges[index + 1] - 8 : edges[index] + 8,
        y + 7, font, ink, 12, right);
    });
    y += h;
    ctx.strokeStyle = edge;
    ctx.beginPath();
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(PAGE_W - MARGIN, y);
    ctx.stroke();
  }

  beginPage();

  for (const note of context) {
    const lines = linesFor(note.replace(/\s+/g, ' '), '10px Arial, sans-serif',
      contentWidth);
    await ensureRoom(lines.length * 14 + 7);
    paint(lines, MARGIN, y, '10px Arial, sans-serif', muted, 14);
    y += lines.length * 14 + 7;
  }
  // Keep the customer and payment information in the same two-column structure
  // used by the desktop document, independently of the iPhone viewport width.
  const panelWidth = (contentWidth - 12) / 2;
  const panels = contacts.slice(0, 2).map(fieldGroup => {
    const result: { lines: string[]; label: boolean }[] = [];
    fieldGroup.forEach((field, index) => {
      const font = index === 0 ? '10px Arial, sans-serif' : '700 11px Arial, sans-serif';
      result.push({ lines: linesFor(field, font, panelWidth - 26), label: index === 0 });
    });
    return result;
  });
  const panelHeight = Math.max(62, ...panels.map(panel =>
    18 + panel.reduce((height, field) =>
      height + field.lines.length * (field.label ? 13 : 15) + 4, 0)));
  await ensureRoom(panelHeight + 20);
  panels.forEach((panel, index) => {
    const x = MARGIN + index * (panelWidth + 12);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, panelWidth, panelHeight);
    ctx.strokeStyle = edge;
    ctx.strokeRect(x + .5, y + .5, panelWidth - 1, panelHeight - 1);
    let lineTop = y + 12;
    panel.forEach(field => {
      const font = field.label ? '10px Arial, sans-serif' : '700 11px Arial, sans-serif';
      const lineHeight = field.label ? 13 : 15;
      paint(field.lines, x + 12, lineTop, font, field.label ? muted : ink, lineHeight);
      lineTop += field.lines.length * lineHeight + 4;
    });
  });
  y += panelHeight + 20;

  drawTableHeader();
  for (const row of rows) {
    const cols = [row[0] || 'Artículo', row[1] || '', row[2] || '', row[3] || ''];
    const cellLines = cols.map((value, index) =>
      linesFor(value.replace(/\s*\n\s*/g, ' · '),
        index === 0 ? '700 10px Arial, sans-serif' : '10px Arial, sans-serif',
        edges[index + 1] - edges[index] - 16));
    const height = Math.max(43, 14 + Math.max(...cellLines.map(lines => lines.length)) * 13);
    await ensureRoom(height, true);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(MARGIN, y, contentWidth, height);
    cellLines.forEach((lines, index) => paint(lines,
      index === 0 ? edges[index] + 8 : edges[index + 1] - 8, y + 9,
      index === 0 ? '700 10px Arial, sans-serif' : '10px Arial, sans-serif',
      ink, 13, index > 0));
    y += height;
    ctx.strokeStyle = edge;
    ctx.beginPath();
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(PAGE_W - MARGIN, y);
    ctx.stroke();
  }

  // Desktop-style summary: notes on the left, aligned totals on the right.
  // The entire TOTAL area is explicitly WHITE, regardless of dark/Glass theme.
  y += 22;
  const summaryRight = MARGIN + 252;
  const totalWidth = PAGE_W - MARGIN - summaryRight;
  const noteLines = linesFor(notes, '10px Arial, sans-serif', summaryRight - MARGIN - 18);
  const summaryHeight = Math.max(38 + noteLines.length * 14, 22 + totalRows.length * 27);
  await ensureRoom(summaryHeight + 8);
  if (noteLines.length) {
    paint(noteLines, MARGIN + 2, y + 10, '10px Arial, sans-serif', muted, 14);
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(summaryRight, y, totalWidth, summaryHeight);
  ctx.strokeStyle = edge;
  ctx.strokeRect(summaryRight + .5, y + .5, totalWidth - 1, summaryHeight - 1);
  totalRows.forEach((row, i) => {
    const isTotal = row[0]?.trim().toLocaleLowerCase() === 'total';
    const top = y + 12 + i * 27;
    if (isTotal) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(summaryRight + 1, top - 5, totalWidth - 2, 26);
      ctx.strokeStyle = edge;
      ctx.beginPath();
      ctx.moveTo(summaryRight + 12, top - 5);
      ctx.lineTo(summaryRight + totalWidth - 12, top - 5);
      ctx.stroke();
    }
    const font = isTotal ? '700 14px Arial, sans-serif' : '11px Arial, sans-serif';
    paint([row[0] || ''], summaryRight + 12, top, font, ink, 16);
    paint([row[1] || ''], summaryRight + totalWidth - 12, top, font, ink, 16, true);
  });

  await finishPage();
  return assemblePdf(images, canvas.width, canvas.height);
}
