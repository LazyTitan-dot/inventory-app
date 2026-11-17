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
  const receiptLogo: HTMLImageElement = logo;

  const heading = receipt.querySelector('.commerce-document-heading');
  const contact = receipt.querySelector('.commerce-document-contact');
  const table = receipt.querySelector('table');
  const totals = receipt.querySelector('.commerce-totals');
  if (!heading || !contact || !table || !totals) throw new Error('Incomplete receipt');

  // The iOS PDF and desktop print use the same printable values. They do not
  // change the actual sale, tax record, or the dark-mode document on screen.
  const printText = (element: Element | null | undefined) =>
    element?.querySelector('.receipt-print-only')?.textContent?.trim() || displayed(element);
  const title = displayed(heading.querySelector('h2')) || 'Recibo de venta';
  const date = displayed(heading.querySelector('p')) || number;
  const status = displayed(heading.querySelector('.badge')) || 'Completada';
  const contacts = Array.from(contact.children).slice(0, 2).map(group =>
    Array.from(group.children).map(displayed).filter(Boolean));
  const itemRows = Array.from(table.querySelectorAll('tbody tr')).map(row => {
    const cells = Array.from(row.children);
    return {
      title: displayed(cells[0]?.querySelector('strong')) || 'Artículo',
      detail: displayed(cells[0]?.querySelector('.commerce-table-meta')),
      warranty: Array.from(cells[0]?.querySelectorAll('small') || [])
        .map(displayed).filter(value => value && !value.includes('Sin vínculo') &&
          value !== displayed(cells[0]?.querySelector('.commerce-table-meta'))).join(' · '),
      quantity: printText(cells[1]),
      unit: printText(cells[2]),
      amount: printText(cells[3]),
    };
  });
  const totalRows = Array.from(totals.children)
    .filter(element => !element.classList.contains('receipt-tax-row'))
    .map(element => Array.from(element.children).map(printText));
  const notes = Array.from(receipt.querySelectorAll('.commerce-document-notes p:not(.sales-screen-footer)'))
    .map(displayed).filter(Boolean).join('\n');
  const footer = displayed(receipt.querySelector('.sales-print-footer')) ||
    'Gracias por su compra. Conserve este recibo.';

  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W * SCALE;
  canvas.height = PAGE_H * SCALE;
  const drawingContext = canvas.getContext('2d', { alpha: false });
  if (!drawingContext) throw new Error('Canvas unavailable');
  const ctx: CanvasRenderingContext2D = drawingContext;
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'top';

  const navy = '#0b2753';
  const cyan = '#0b9dd8';
  const ink = '#162b48';
  const muted = '#526982';
  const rule = '#c2ddef';
  const contentWidth = PAGE_W - 2 * MARGIN;
  const contentEnd = MARGIN + contentWidth;
  const bottom = PAGE_H - 50;
  const tableEdges = [MARGIN, MARGIN + 226, MARGIN + 279, MARGIN + 387, contentEnd];
  const images: Uint8Array[] = [];
  let y = MARGIN, page = 0;
  let tableStarted = false;

  function linesFor(value: string, font: string, width: number) {
    ctx.font = font;
    return wrapped(ctx, value, width).filter(Boolean);
  }
  function drawLines(lines: string[], x: number, top: number, font: string,
    color: string, lineHeight = 14, align: CanvasTextAlign = 'left') {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    lines.forEach((line, i) => ctx.fillText(line, x, top + i * lineHeight));
    ctx.textAlign = 'left';
  }
  function rounded(x: number, top: number, width: number, height: number,
    radius: number, color: string, stroke?: string) {
    ctx.beginPath();
    ctx.roundRect(x, top, width, height, radius);
    ctx.fillStyle = color;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.4; ctx.stroke(); }
  }
  function line(x1: number, y1: number, x2: number, y2: number, color = rule, width = 1) {
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function beginPage() {
    page++;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);

    // Restrained version of the navy/cyan curved corner in the supplied reference.
    ctx.fillStyle = navy;
    ctx.beginPath();
    ctx.moveTo(PAGE_W - 177, 0); ctx.lineTo(PAGE_W, 0);
    ctx.lineTo(PAGE_W, 20); ctx.quadraticCurveTo(PAGE_W - 85, 16, PAGE_W - 177, 0);
    ctx.fill();
    ctx.strokeStyle = cyan; ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(PAGE_W - 160, 0); ctx.quadraticCurveTo(PAGE_W - 65, 13, PAGE_W, 29);
    ctx.stroke();

    const logoScale = Math.min(210 / receiptLogo.naturalWidth, 78 / receiptLogo.naturalHeight);
    const logoWidth = receiptLogo.naturalWidth * logoScale;
    const logoHeight = receiptLogo.naturalHeight * logoScale;
    const logoTop = MARGIN + 11;
    ctx.drawImage(receiptLogo, MARGIN, logoTop, logoWidth, logoHeight);
    const headX = MARGIN + 233;
    const displayTitle = page === 1 ? title.toLocaleUpperCase('es') : 'RECIBO · CONTINUACIÓN';
    drawLines(linesFor(displayTitle, '700 21px Georgia, serif', contentEnd - headX),
      headX, MARGIN + 9, '700 21px Georgia, serif', navy, 25);
    const dateParts = date.split(' · ');
    drawLines([dateParts[0] || number], headX, MARGIN + 43,
      '700 13px Arial, sans-serif', navy);
    drawLines(linesFor(dateParts.slice(1).join(' · ') || date, '11px Arial, sans-serif',
      contentEnd - headX), headX, MARGIN + 61,
      '11px Arial, sans-serif', ink, 13);
    rounded(contentEnd - 88, MARGIN + 83, 88, 22, 7, '#e5f5ec', '#cce8da');
    drawLines([status], contentEnd - 44, MARGIN + 89,
      '700 10px Arial, sans-serif', '#22573d', 12, 'center');
    y = Math.max(MARGIN + 118, logoTop + logoHeight + 30);
    line(MARGIN, y, contentEnd, y, cyan, 2);
    y += 23;
    tableStarted = false;
  }
  async function finishPage() {
    drawLines([number + '  ·  Página ' + page], contentEnd, PAGE_H - 25,
      '9px Arial, sans-serif', muted, 11, 'right');
    images.push(await jpeg(canvas));
  }
  async function ensureRoom(height: number, table = false) {
    if (y + height <= bottom) return;
    await finishPage();
    beginPage();
    if (table) drawTableHeading();
  }
  function drawTableHeading() {
    const height = 38;
    rounded(MARGIN, y, contentWidth, height, 6, navy);
    const headings = ['Producto', 'Cant.', 'Precio unitario', 'Importe'];
    headings.forEach((label, i) => {
      const right = i > 0;
      const x = right ? tableEdges[i + 1]! - 9 : tableEdges[i]! + 10;
      const available = tableEdges[i + 1]! - tableEdges[i]! - 18;
      const lines = linesFor(label, '700 10px Arial, sans-serif', available);
      drawLines(lines, x, y + 12, '700 10px Arial, sans-serif', '#ffffff', 12,
        right ? 'right' : 'left');
    });
    y += height;
    tableStarted = true;
  }

  beginPage();

  // Customer card is a single bordered panel, divided into two information areas.
  const panelGap = 16;
  const leftWidth = Math.round(contentWidth * .68);
  const contactGroups = contacts.map((values, index) => {
    const width = index === 0 ? leftWidth - 31 : contentWidth - leftWidth - 38;
    return values.map((value, i) => ({
      label: i === 0,
      lines: linesFor(value, i === 0 ? '700 10px Arial, sans-serif' :
        i === 1 ? '700 12px Arial, sans-serif' : '10px Arial, sans-serif', width),
    }));
  });
  const groupHeights = contactGroups.map(group =>
    26 + group.reduce((height, value) => height + value.lines.length *
      (value.label ? 14 : 15) + 4, 0));
  const contactHeight = Math.max(84, ...groupHeights);
  await ensureRoom(contactHeight + panelGap);
  rounded(MARGIN, y, contentWidth, contactHeight, 10, '#ffffff', navy);
  line(MARGIN + leftWidth, y + 13, MARGIN + leftWidth,
    y + contactHeight - 13, cyan, 1.5);
  contactGroups.forEach((group, index) => {
    const x = MARGIN + (index === 0 ? 17 : leftWidth + 16);
    let lineTop = y + 14;
    group.forEach((value, i) => {
      const font = i === 0 ? '700 10px Arial, sans-serif' :
        i === 1 ? '700 12px Arial, sans-serif' : '10px Arial, sans-serif';
      const lineHeight = i === 0 ? 14 : 15;
      drawLines(value.lines, x, lineTop, font, i === 0 ? '#007db9' : navy, lineHeight);
      lineTop += value.lines.length * lineHeight + 4;
    });
  });
  y += contactHeight + 24;

  await ensureRoom(58, true);
  if (!tableStarted) drawTableHeading();
  for (const row of itemRows) {
    const nameLines = linesFor(row.title, '700 12px Georgia, serif', tableEdges[1]! - MARGIN - 18);
    const detailLines = linesFor(row.detail.replace(/\s*\n\s*/g, ' · '),
      '9px Arial, sans-serif', tableEdges[1]! - MARGIN - 18);
    const warrantyLines = linesFor(row.warranty, 'italic 9px Arial, sans-serif',
      tableEdges[1]! - MARGIN - 18);
    const itemHeight = 13 + nameLines.length * 16 +
      detailLines.length * 12 + warrantyLines.length * 12 + 13;
    const cells = [row.quantity, row.unit, row.amount];
    const numericLines = cells.map((value, i) => linesFor(value,
      '10px Arial, sans-serif', tableEdges[i + 2]! - tableEdges[i + 1]! - 14));
    const height = Math.max(51, itemHeight, 24 + Math.max(...numericLines.map(a => a.length)) * 14);
    await ensureRoom(height + 1, true);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(MARGIN, y, contentWidth, height);
    let top = y + 10;
    drawLines(nameLines, MARGIN + 10, top, '700 12px Georgia, serif', navy, 16);
    top += nameLines.length * 16 + 2;
    drawLines(detailLines, MARGIN + 10, top, '9px Arial, sans-serif', ink, 12);
    top += detailLines.length * 12 + 2;
    drawLines(warrantyLines, MARGIN + 10, top, 'italic 9px Arial, sans-serif', muted, 12);
    numericLines.forEach((lines, i) =>
      drawLines(lines, tableEdges[i + 2]! - 8, y + Math.max(14, (height - 14) / 2),
        '10px Arial, sans-serif', ink, 14, 'right'));
    y += height;
    line(MARGIN, y, contentEnd, y, rule, 1);
  }
  line(MARGIN, y, MARGIN, y - Math.min(60, y - MARGIN), navy, 1);
  line(contentEnd, y, contentEnd, y - Math.min(60, y - MARGIN), navy, 1);

  // White summary card with a navy TOTAL ribbon (print only).
  const summaryX = MARGIN + 206;
  const summaryW = contentEnd - summaryX;
  const normalHeight = 29;
  const totalHeight = 43;
  const summaryHeight = 20 + totalRows.reduce((sum, row) =>
    sum + (row[0]?.trim().toLocaleLowerCase('es') === 'total' ? totalHeight : normalHeight), 0) + 9;
  const noteLines = linesFor(notes, 'italic 10px Arial, sans-serif', summaryX - MARGIN - 22);
  await ensureRoom(Math.max(summaryHeight, 16 + noteLines.length * 14) + 38);
  y += 23;
  drawLines(noteLines, MARGIN + 3, y + 11, 'italic 10px Arial, sans-serif', ink, 14);
  rounded(summaryX, y, summaryW, summaryHeight, 9, '#ffffff', cyan);
  let rowY = y + 11;
  for (const row of totalRows) {
    const isTotal = row[0]?.trim().toLocaleLowerCase('es') === 'total';
    if (isTotal) {
      ctx.fillStyle = navy;
      ctx.fillRect(summaryX + 1, rowY - 2, summaryW - 2, totalHeight);
      drawLines([row[0] || 'Total'], summaryX + 13, rowY + 7,
        '700 16px Arial, sans-serif', '#ffffff');
      drawLines([row[1] || ''], contentEnd - 13, rowY + 7,
        '700 16px Arial, sans-serif', '#ffffff', 17, 'right');
      rowY += totalHeight;
    } else {
      drawLines([row[0] || ''], summaryX + 13, rowY + 4,
        '10px Arial, sans-serif', ink);
      drawLines([row[1] || ''], contentEnd - 13, rowY + 4,
        '10px Arial, sans-serif', ink, 14, 'right');
      rowY += normalHeight;
    }
  }
  y += summaryHeight + 33;
  const footerLines = linesFor(footer, 'italic 700 13px Georgia, serif', contentWidth - 135);
  await ensureRoom(footerLines.length * 17 + 34);
  // Center the closing message on short, one-page receipts.
  y = Math.max(y, PAGE_H - 99);
  const footerTop = y;
  line(MARGIN + 6, footerTop + 9, MARGIN + 93, footerTop + 9, cyan, 2);
  line(contentEnd - 93, footerTop + 9, contentEnd - 6, footerTop + 9, cyan, 2);
  drawLines(footerLines, PAGE_W / 2, footerTop,
    'italic 700 13px Georgia, serif', navy, 17, 'center');
  ctx.fillStyle = cyan;
  ctx.fillRect(0, PAGE_H - 9, PAGE_W, 3);
  ctx.fillStyle = navy;
  ctx.fillRect(0, PAGE_H - 6, PAGE_W, 6);

  await finishPage();
  return assemblePdf(images, canvas.width, canvas.height);
}
