// SPDX-FileCopyrightText: 2026 DX-OS contributors
// SPDX-License-Identifier: Apache-2.0
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Worker } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';

export interface PdfTextChunk { page: number; content: string }
// Static trusted worker program. PDF data is never evaluated as JavaScript or a URL.
const PROGRAM = `
const {parentPort, workerData} = require('node:worker_threads');
(async () => {
  const {getDocument} = await import(workerData.moduleUrl);
  const doc = await getDocument({data: new Uint8Array(workerData.bytes), isEvalSupported:false,
    disableFontFace:true, useSystemFonts:false, useWorkerFetch:false, useWasm:false,
    stopAtErrors:true, verbosity:0}).promise;
  try {
    if(doc.numPages > 30) throw Error('limit');
    let total=0; const chunks=[];
    for(let n=1;n<=doc.numPages;n++) {
      const page=await doc.getPage(n); const text=await page.getTextContent();
      const content=text.items.filter(i=>typeof i.str==='string').map(i=>i.str).join(' ').replace(/\\s+/g,' ').trim();
      total+=content.length; if(total>100000) throw Error('limit');
      for(let i=0;i<content.length;i+=1800) chunks.push({page:n,content:content.slice(i,i+2000)});
      if(chunks.length>100) throw Error('limit'); page.cleanup();
    }
    if(!chunks.length) throw Error('no text'); parentPort.postMessage({chunks});
  } finally {await doc.destroy();}
})().catch(()=>parentPort.postMessage({error:true}));
`;
@Injectable()
export class PdfTextService {
  private active = 0;
  async extract(bytes: Buffer): Promise<PdfTextChunk[]> {
    if (bytes.length > 5 * 1024 * 1024 || bytes.subarray(0, 5).toString() !== '%PDF-') throw new BadRequestException('PDF không hợp lệ hoặc vượt giới hạn 5 MB.');
    if (this.active >= 2) throw new ServiceUnavailableException('Đang xử lý tài liệu khác. Vui lòng thử lại.');
    this.active++;
    try {
      return await new Promise<PdfTextChunk[]>((resolve, reject) => {
        const worker = new Worker(PROGRAM, { eval: true, workerData: { bytes,
          moduleUrl: pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href },
          stdout: true, stderr: true, resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 } });
        let settled = false;
        const finish = (chunks?: PdfTextChunk[]) => {
          if (settled) return; settled = true; clearTimeout(timer); void worker.terminate();
          if (chunks) resolve(chunks); else reject(new BadRequestException('Không đọc được PDF. Chỉ hỗ trợ PDF có lớp văn bản, tối đa 30 trang / 100.000 ký tự.'));
        };
        const timer = setTimeout(() => finish(), 8000);
        worker.once('message', (message: { chunks?: PdfTextChunk[] }) => finish(message.chunks));
        worker.once('error', () => finish()); worker.once('exit', () => finish());
        // Drain parser diagnostics without logging document contents or raw exceptions.
        worker.stdout?.resume(); worker.stderr?.resume();
      });
    } finally { this.active--; }
  }
}
