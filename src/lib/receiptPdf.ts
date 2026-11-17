/**
 * Create a local, multipage PDF from the displayed commercial receipt.
 * Canvas preserves Spanish/Unicode text and the exact official PNG logo. Each
 * page is encoded as a 2x-resolution JPEG; no customer data leaves the device.
 * A small PDF 1.4 image writer avoids adding a network-loaded dependency.
 */
const PAGE_W = 595, PAGE_H = 842, SCALE = 2, MARGIN = 25;
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
  const tableEdges = [MARGIN, MARGIN + contentWidth * .46, MARGIN + contentWidth * .56,
    MARGIN + contentWidth * .79, contentEnd];
  const images: Uint8Array[] = [];
  let y = MARGIN, page = 0;
  let tableStarted = false;
  let tableTop = 0;

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

  // Glossy vector details are drawn anew for every receipt, without reusing
  // the sample image's text or customer data.
  function topRibbon() {
    ctx.save();
    const cyanGrad = ctx.createLinearGradient(PAGE_W - 210, 0, PAGE_W, 85);
    cyanGrad.addColorStop(0, '#1cceff'); cyanGrad.addColorStop(.6, '#00aeeb');
    cyanGrad.addColorStop(1, '#0272c4');
    ctx.fillStyle = cyanGrad; ctx.beginPath();
    ctx.moveTo(PAGE_W - 211, 0);
    ctx.bezierCurveTo(PAGE_W - 126, 7, PAGE_W - 43, 32, PAGE_W, 86);
    ctx.lineTo(PAGE_W, 0); ctx.closePath(); ctx.fill();

    const darkGrad = ctx.createLinearGradient(PAGE_W - 180, 0, PAGE_W - 10, 60);
    darkGrad.addColorStop(0, '#235d9f'); darkGrad.addColorStop(.20, '#102f64');
    darkGrad.addColorStop(.56, '#061b44'); darkGrad.addColorStop(.80, '#173e7b');
    darkGrad.addColorStop(1, '#04102e');
    ctx.fillStyle = darkGrad; ctx.beginPath();
    ctx.moveTo(PAGE_W - 181, 0);
    ctx.bezierCurveTo(PAGE_W - 116, 5, PAGE_W - 32, 23, PAGE_W, 64);
    ctx.lineTo(PAGE_W, 0); ctx.closePath(); ctx.fill();

    const highlight = ctx.createLinearGradient(PAGE_W - 168, 0, PAGE_W, 69);
    highlight.addColorStop(0, '#aeefff'); highlight.addColorStop(.5, '#f8ffff');
    highlight.addColorStop(1, '#08cdff');
    ctx.strokeStyle = highlight; ctx.lineWidth = 2.4; ctx.beginPath();
    ctx.moveTo(PAGE_W - 181, 0);
    ctx.bezierCurveTo(PAGE_W - 116, 5, PAGE_W - 32, 23, PAGE_W + 1, 64);
    ctx.stroke(); ctx.restore();
  }
  function bottomRibbon() {
    ctx.save();
    const cyanGrad = ctx.createLinearGradient(0, PAGE_H - 55, PAGE_W, PAGE_H);
    cyanGrad.addColorStop(0, '#00befe'); cyanGrad.addColorStop(.50, '#0098de');
    cyanGrad.addColorStop(1, '#11c4fb');
    ctx.fillStyle = cyanGrad; ctx.beginPath();
    ctx.moveTo(0, PAGE_H - 46);
    ctx.bezierCurveTo(125, PAGE_H + 2, 380, PAGE_H - 3, PAGE_W, PAGE_H - 7);
    ctx.lineTo(PAGE_W, PAGE_H); ctx.lineTo(0, PAGE_H);
    ctx.closePath(); ctx.fill();

    const darkGrad = ctx.createLinearGradient(0, PAGE_H - 20, PAGE_W, PAGE_H);
    darkGrad.addColorStop(0, '#061838'); darkGrad.addColorStop(.36, '#16427c');
    darkGrad.addColorStop(.7, '#061738'); darkGrad.addColorStop(1, '#0a2d5e');
    ctx.fillStyle = darkGrad; ctx.beginPath();
    ctx.moveTo(0, PAGE_H - 17);
    ctx.bezierCurveTo(134, PAGE_H + 7, 388, PAGE_H + 1, PAGE_W, PAGE_H - 1);
    ctx.lineTo(PAGE_W, PAGE_H); ctx.lineTo(0, PAGE_H);
    ctx.closePath(); ctx.fill();

    ctx.strokeStyle = '#e4faff'; ctx.lineWidth = 2.4; ctx.beginPath();
    ctx.moveTo(0, PAGE_H - 37);
    ctx.bezierCurveTo(128, PAGE_H - 2, 379, PAGE_H - 5, PAGE_W, PAGE_H - 6);
    ctx.stroke(); ctx.restore();
  }
  function glossBand(x: number, top: number, width: number, height: number, radius: number) {
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, top, width, height, radius); ctx.clip();
    const base = ctx.createLinearGradient(0, top, 0, top + height);
    base.addColorStop(0, '#071d47'); base.addColorStop(.2, '#20538d');
    base.addColorStop(.52, '#0c326b'); base.addColorStop(1, '#061641');
    ctx.fillStyle = base; ctx.fillRect(x, top, width, height);
    const sheen = ctx.createLinearGradient(x, top, x + width, top + height);
    sheen.addColorStop(0, 'rgba(255,255,255,.05)');
    sheen.addColorStop(.40, 'rgba(208,244,255,.26)');
    sheen.addColorStop(.7, 'rgba(240,250,255,.045)');
    sheen.addColorStop(1, 'rgba(215,249,255,.10)');
    ctx.fillStyle = sheen; ctx.beginPath();
    ctx.moveTo(x - 4, top + height * .55);
    ctx.bezierCurveTo(x + width * .25, top - height * .45,
      x + width * .53, top + height * .91, x + width + 4, top + height * .17);
    ctx.lineTo(x + width + 4, top); ctx.lineTo(x - 4, top);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(170,239,255,.36)'; ctx.lineWidth = .9; ctx.beginPath();
    ctx.moveTo(x, top + 1); ctx.lineTo(x + width, top + 1); ctx.stroke();
    ctx.restore();
  }
  function closeTable() {
    if (!tableStarted) return;
    ctx.strokeStyle = navy; ctx.lineWidth = 1.4; ctx.beginPath();
    ctx.roundRect(MARGIN + .7, tableTop + .7, contentWidth - 1.4,
      Math.max(1, y - tableTop - 1.4), 8);
    ctx.stroke(); tableStarted = false;
  }
  function beginPage() {
    page++;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    topRibbon();

    const logoScale = Math.min(208 / receiptLogo.naturalWidth, 115 / receiptLogo.naturalHeight);
    const logoWidth = receiptLogo.naturalWidth * logoScale;
    const logoHeight = receiptLogo.naturalHeight * logoScale;
    const logoTop = MARGIN + 6;
    ctx.drawImage(receiptLogo, MARGIN - 5, logoTop, logoWidth, logoHeight);

    const headX = MARGIN + 207;
    line(headX - 16, MARGIN + 28, headX - 16, MARGIN + 108, cyan, 1.6);
    const displayTitle = title.toLocaleUpperCase('es');
    let titleSize = 28;
    while (titleSize > 20) {
      ctx.font = '700 ' + titleSize + 'px Georgia, serif';
      if (ctx.measureText(displayTitle).width <= contentEnd - headX) break;
      titleSize--;
    }
    drawLines([displayTitle], headX, MARGIN + 29,
      '700 ' + titleSize + 'px Georgia, serif', navy, 32);
    const dateParts = date.split(' · ');
    drawLines([dateParts[0] || number], headX, MARGIN + 64,
      '700 15px Arial, sans-serif', navy);
    drawLines(linesFor(dateParts.slice(1).join(' · ') || date,
      '12px Arial, sans-serif', contentEnd - headX), headX, MARGIN + 86,
      '12px Arial, sans-serif', ink, 14);
    rounded(contentEnd - 88, MARGIN + 70, 88, 24, 7, '#e2f3e9', '#cce6d5');
    drawLines([status], contentEnd - 44, MARGIN + 77,
      '700 11px Arial, sans-serif', '#205638', 13, 'center');

    y = Math.max(MARGIN + 128, logoTop + logoHeight + 9);
    tableStarted = false;
    tableTop = 0;
  }
  async function finishPage() {
    closeTable();
    bottomRibbon();
    drawLines([number + '  ·  Página ' + page], contentEnd, PAGE_H - 52,
      '8px Arial, sans-serif', muted, 10, 'right');
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
    tableTop = y;
    glossBand(MARGIN, y, contentWidth, height, 7);
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
  closeTable();

  // White summary card with a navy TOTAL ribbon (print only).
  const summaryX = MARGIN + 224;
  const summaryW = contentEnd - summaryX;
  const normalHeight = 29;
  const totalHeight = 43;
  const summaryHeight = 20 + totalRows.reduce((sum, row) =>
    sum + (row[0]?.trim().toLocaleLowerCase('es') === 'total' ? totalHeight : normalHeight), 0) + 9;
  const noteLines = linesFor(notes, 'italic 10px Arial, sans-serif', summaryX - MARGIN - 22);
  // Reserve room for the final footer before committing the summary.
  // This prevents a nearly empty extra sheet with only the thank-you message.
  const summarySpace = Math.max(summaryHeight, 16 + noteLines.length * 14);
  if (y + 23 + summarySpace > PAGE_H - 115) {
    await finishPage();
    beginPage();
  }
  y += 23;
  drawLines(noteLines, MARGIN + 3, y + 11, 'italic 10px Arial, sans-serif', ink, 14);
  rounded(summaryX, y, summaryW, summaryHeight, 9, '#ffffff', cyan);
  let rowY = y + 11;
  for (const row of totalRows) {
    const isTotal = row[0]?.trim().toLocaleLowerCase('es') === 'total';
    if (isTotal) {
      glossBand(summaryX + 1, rowY - 2, summaryW - 2, totalHeight, 0);
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
  y += summaryHeight;
  const footerLines = linesFor(footer, 'italic 700 13px Georgia, serif', contentWidth - 110);
  const footerTop = PAGE_H - 88 - (footerLines.length - 1) * 17;
  if (y + 12 > footerTop) {
    await finishPage();
    beginPage();
  }
  line(MARGIN + 6, footerTop + 9, MARGIN + 93, footerTop + 9, cyan, 2);
  line(contentEnd - 93, footerTop + 9, contentEnd - 6, footerTop + 9, cyan, 2);
  drawLines(footerLines, PAGE_W / 2, footerTop,
    'italic 700 13px Georgia, serif', navy, 17, 'center');
  await finishPage();
  return assemblePdf(images, canvas.width, canvas.height);
}
