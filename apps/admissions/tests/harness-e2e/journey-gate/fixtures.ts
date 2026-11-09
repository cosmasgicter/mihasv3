/**
 * Files the gate uploads, generated at test time (SJR task 4.2, design R9-b).
 *
 * No binary is committed. Both files carry synthetic content only: no identity, no
 * real document.
 */
import type { Page } from '@playwright/test';

/**
 * A valid PDF of exactly `totalBytes` bytes: a one-page document whose content stream
 * is padded to the size. Built by hand so the gate needs no PDF library.
 */
export function makePdf(totalBytes: number, label = 'Synthetic gate document'): Buffer {
  const header = '%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n';
  const catalog = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const pages = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  const page =
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R ' +
    '/Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n';
  const font = '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';
  const visible = `BT /F1 18 Tf 72 700 Td (${label.replace(/[()\\]/g, '')}) Tj ET\n`;
  const build = (padding: number): Buffer => {
    // The padding is a PDF comment inside the content stream: valid, inert, and any size.
    const stream = padding > 0 ? `${visible}% ${'x'.repeat(padding)}\n` : visible;
    const content = `4 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream\nendobj\n`;
    const order = [catalog, pages, page, content, font];
    const offsets: number[] = [];
    let offset = Buffer.byteLength(header);
    for (const part of order) {
      offsets.push(offset);
      offset += Buffer.byteLength(part);
    }
    const xref =
      `xref\n0 6\n0000000000 65535 f \n` +
      offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
      `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
    return Buffer.from(header + order.join('') + xref, 'latin1');
  };
  const bare = build(0);
  if (totalBytes <= bare.length) return bare;
  // Each padding byte adds one byte, plus a fixed overhead for the comment line and the
  // longer /Length digits; converge on the exact size.
  let padding = totalBytes - bare.length;
  let out = build(padding);
  for (let i = 0; i < 6 && out.length !== totalBytes; i += 1) {
    padding += totalBytes - out.length;
    out = build(padding);
  }
  return out;
}

/** A PNG with legible text on it, drawn in the page's canvas (so no encoder is needed here). */
export async function makePng(page: Page, lines: string[]): Promise<Buffer> {
  const dataUrl = await page.evaluate((textLines) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 420;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111111';
    ctx.font = 'bold 26px sans-serif';
    textLines.forEach((line, index) => ctx.fillText(line, 28, 56 + index * 44));
    return canvas.toDataURL('image/png');
  }, lines);
  return Buffer.from(dataUrl.split(',')[1]!, 'base64');
}

/** Bytes of a file as `setInputFiles` takes them. */
export function asUpload(name: string, mimeType: string, buffer: Buffer) {
  return { name, mimeType, buffer };
}
