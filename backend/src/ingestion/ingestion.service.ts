import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as crypto from 'node:crypto';
import pdfParse = require('pdf-parse');
import { BusinessError } from '../common/errors';
import { StorageService } from '../storage/storage.service';
import { EmbeddingService, ElasticsearchService } from '../retrieval/retrieval.service';

export interface ChunkRecord {
  id?: number;
  documentId: number;
  groupId: number;
  chunkIndex: number;
  chunkText: string;
  chunkSummary: string;
  charStart: number;
  charEnd: number;
  metadata: Record<string, unknown>;
}

@Injectable()
export class IngestionService {
  constructor(
    private readonly ds: DataSource,
    private readonly storage: StorageService,
    private readonly embeddings: EmbeddingService,
    private readonly elasticsearch: ElasticsearchService
  ) {}

  async processDocument(documentId: number, groupId: number) {
    const document = (await this.ds.query('select id, group_id as "groupId", file_name as "fileName", file_ext as "fileExt", storage_bucket as "storageBucket", storage_object_key as "storageObjectKey" from documents where id = $1 and group_id = $2 and deleted = false', [documentId, groupId]))[0];
    if (!document) throw new BusinessError('Document to ingest does not exist');
    const buffer = await this.storage.getObjectBuffer(document.storageBucket, document.storageObjectKey);
    const rawText = await this.parseDocument(document.fileExt, buffer);
    const cleanText = this.cleanText(rawText);
    if (!cleanText) throw new BusinessError('Parsed document is empty');
    await this.ds.query('update documents set preview_text = $1, updated_at = now() where id = $2 and group_id = $3', [cleanText.slice(0, 200), documentId, groupId]);
    const chunks = this.chunkText(cleanText, documentId, groupId, document.fileName);
    await this.saveChunks(documentId, chunks);
    await this.embeddings.ingestChunks(documentId, chunks);
    await this.elasticsearch.indexReadyChunks(document.fileName, chunks);
  }

  private async parseDocument(ext: string, buffer: Buffer): Promise<string> {
    const normalized = String(ext ?? '').toLowerCase();
    if (normalized === 'txt' || normalized === 'md') return buffer.toString('utf8');
    if (normalized === 'pdf') {
      // pdf.js v2 misreads pooled Buffer backing arrays on Node 20/22; pass a tight view.
      const pdfData = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) as unknown as Buffer;
      const result = await pdfParse(pdfData, { version: 'v2.0.550' });
      return result.text ?? '';
    }
    if (normalized === 'docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value ?? '';
    }
    throw new BusinessError('Unsupported file type');
  }

  private cleanText(text: string): string {
    return String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  private chunkText(text: string, documentId: number, groupId: number, fileName: string): ChunkRecord[] {
    const max = Number(process.env.CHUNK_MAX_CHARS ?? 320);
    const target = Number(process.env.CHUNK_TARGET_CHARS ?? 240);
    const overlap = Number(process.env.CHUNK_OVERLAP_CHARS ?? 32);
    const chunks: ChunkRecord[] = [];
    let cursor = 0;
    while (cursor < text.length) {
      let end = Math.min(text.length, cursor + target);
      if (end < text.length) {
        const nextBreak = text.lastIndexOf('\n\n', end);
        const sentenceBreak = Math.max(text.lastIndexOf('。', end), text.lastIndexOf('.', end), text.lastIndexOf('!', end), text.lastIndexOf('?', end));
        const candidate = Math.max(nextBreak, sentenceBreak);
        if (candidate > cursor + Math.floor(target / 2)) end = Math.min(candidate + 1, cursor + max);
      }
      end = Math.min(end, cursor + max);
      const chunkText = text.slice(cursor, end).trim();
      if (chunkText) {
        const metadata = {
          documentId,
          groupId,
          chunkIndex: chunks.length,
          charStart: cursor,
          charEnd: end,
          fileName,
          chunkStrategy: 'structure-aware-token-budget-v1'
        };
        chunks.push({
          documentId,
          groupId,
          chunkIndex: chunks.length,
          chunkText,
          chunkSummary: chunkText.length <= 120 ? chunkText : chunkText.slice(0, 120) + '...',
          charStart: cursor,
          charEnd: end,
          metadata
        });
      }
      if (end >= text.length) break;
      cursor = Math.max(end - overlap, cursor + 1);
    }
    if (chunks.length === 0) throw new BusinessError('Document chunk result is empty');
    return chunks;
  }

  private async saveChunks(documentId: number, chunks: ChunkRecord[]) {
    await this.ds.transaction(async manager => {
      await manager.query('delete from document_chunks where document_id = $1', [documentId]);
      for (const chunk of chunks) {
        const rows = await manager.query('insert into document_chunks (document_id, group_id, chunk_index, chunk_text, chunk_summary, char_start, char_end, metadata_json, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now(),now()) returning id', [chunk.documentId, chunk.groupId, chunk.chunkIndex, chunk.chunkText, chunk.chunkSummary, chunk.charStart, chunk.charEnd, JSON.stringify(chunk.metadata)]);
        chunk.id = Number(rows[0].id);
        chunk.metadata.chunkId = chunk.id;
      }
    });
  }

  buildObjectKey(groupId: number, userId: number, ext: string): string {
    return 'groups/' + groupId + '/users/' + userId + '/' + crypto.randomUUID().replace(/-/g, '') + '.' + ext;
  }
}
