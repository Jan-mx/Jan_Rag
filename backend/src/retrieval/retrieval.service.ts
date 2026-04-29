import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { BusinessError, compactText } from '../common/errors';
import { ChunkRecord } from '../ingestion/ingestion.service';

export interface Citation {
  documentId: number | null;
  chunkId: number | null;
  chunkIndex: number | null;
  fileName: string;
  score: number;
  snippet: string | null;
}

export interface Evidence {
  evidenceId: string;
  documentId: number;
  chunkId: number;
  chunkIndex: number;
  fileName: string;
  text: string;
  score: number;
  retrievalSource: string;
}

@Injectable()
export class ChatModelService {
  constructor(private readonly config: ConfigService) {}

  async complete(prompt: string): Promise<string | null> {
    const key = this.config.get<string>('DASHSCOPE_API_KEY') ?? this.config.get<string>('OPENAI_API_KEY');
    if (!key) return null;
    const base = this.config.get<string>('CHAT_BASE_URL') ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    const model = this.config.get<string>('CHAT_MODEL') ?? 'glm-5';
    const response = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.2 })
    });
    if (!response.ok) throw new BusinessError('Chat model request failed: ' + response.status);
    const json = await response.json() as any;
    return json?.choices?.[0]?.message?.content ?? null;
  }

  async streamComplete(prompt: string, onDelta: (delta: string) => void): Promise<string> {
    const key = this.config.get<string>('DASHSCOPE_API_KEY') ?? this.config.get<string>('OPENAI_API_KEY');
    if (!key) {
      const fallback = this.localFallback(prompt);
      onDelta(fallback);
      return fallback;
    }
    const base = this.config.get<string>('CHAT_BASE_URL') ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    const model = this.config.get<string>('CHAT_MODEL') ?? 'glm-5';
    const response = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: true, messages: [{ role: 'user', content: prompt }], temperature: 0.2 })
    });
    if (!response.ok || !response.body) throw new BusinessError('Chat model stream failed: ' + response.status);
    const decoder = new TextDecoder();
    let buffer = '';
    let finalText = '';
    for await (const raw of response.body as any) {
      buffer += decoder.decode(raw, { stream: true });
      let index = buffer.indexOf('\n\n');
      while (index >= 0) {
        const event = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        for (const line of event.split(/\r?\n/)) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          const json = JSON.parse(data);
          const delta = json?.choices?.[0]?.delta?.content ?? '';
          if (delta) {
            finalText += delta;
            onDelta(delta);
          }
        }
        index = buffer.indexOf('\n\n');
      }
    }
    return finalText.trim();
  }

  private localFallback(prompt: string) {
    const marker = 'Evidence:';
    const evidenceIndex = prompt.indexOf(marker);
    if (evidenceIndex >= 0) {
      return 'No chat model is configured. Retrieved evidence is available; please configure DASHSCOPE_API_KEY to generate a grounded answer.';
    }
    return 'No chat model is configured. Please configure DASHSCOPE_API_KEY.';
  }
}

@Injectable()
export class EmbeddingService implements OnModuleInit {
  constructor(private readonly ds: DataSource, private readonly config: ConfigService) {}

  async onModuleInit() {
    const dim = Number(this.config.get<string>('OLLAMA_EMBEDDING_DIMENSIONS') ?? 512);
    await this.ds.query('create extension if not exists vector').catch(() => undefined);
    await this.ds.query('create table if not exists vector_store (id uuid primary key, content text, metadata jsonb, embedding vector(' + dim + '))').catch(() => undefined);
  }

  async embed(text: string): Promise<number[]> {
    const base = this.config.get<string>('OLLAMA_BASE_URL') ?? 'http://localhost:11434';
    const model = this.config.get<string>('OLLAMA_EMBEDDING_MODEL') ?? 'qllama/bge-small-zh-v1.5';
    const response = await fetch(base.replace(/\/$/, '') + '/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: text, truncate: true })
    }).catch(() => null);
    if (response?.ok) {
      const json = await response.json() as any;
      const embedding = json?.embeddings?.[0] ?? json?.embedding;
      if (Array.isArray(embedding)) return embedding.map(Number);
    }
    const legacy = await fetch(base.replace(/\/$/, '') + '/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text })
    });
    if (!legacy.ok) throw new BusinessError('Embedding request failed: ' + legacy.status);
    const json = await legacy.json() as any;
    if (!Array.isArray(json.embedding)) throw new BusinessError('Embedding response is empty');
    return json.embedding.map(Number);
  }

  async ingestChunks(documentId: number, chunks: ChunkRecord[]) {
    await this.deleteDocumentVectors(documentId);
    for (const chunk of chunks) {
      const embedding = await this.embed(chunk.chunkText);
      await this.ds.query('insert into vector_store (id, content, metadata, embedding) values (gen_random_uuid(), $1, $2::jsonb, $3::vector)', [chunk.chunkText, JSON.stringify(chunk.metadata), '[' + embedding.join(',') + ']']);
    }
  }

  async deleteDocumentVectors(documentId: number) {
    await this.ds.query("delete from vector_store where (metadata::jsonb ->> 'documentId')::bigint = $1", [documentId]).catch(() => undefined);
  }

  async search(groupId: number, question: string, topK: number) {
    try {
      const embedding = await this.embed(question);
      const rows = await this.ds.query("select content, metadata::jsonb as metadata, greatest(0, 1 - (embedding <=> $1::vector)) as score from vector_store where (metadata::jsonb ->> 'groupId')::bigint = $2 order by embedding <=> $1::vector limit $3", ['[' + embedding.join(',') + ']', groupId, topK]);
      return rows.map((row: any) => ({
        documentId: Number(row.metadata.documentId),
        chunkId: Number(row.metadata.chunkId),
        chunkIndex: Number(row.metadata.chunkIndex),
        chunkText: row.content,
        score: Number(row.score)
      }));
    } catch {
      return [];
    }
  }
}

@Injectable()
export class ElasticsearchService {
  private indexInitialized = false;
  constructor(private readonly config: ConfigService) {}

  private baseUrl() {
    const host = this.config.get<string>('ELASTICSEARCH_HOST') ?? 'localhost';
    const port = this.config.get<string>('ELASTICSEARCH_PORT') ?? '9200';
    const scheme = this.config.get<string>('ELASTICSEARCH_SCHEME') ?? 'http';
    return scheme + '://' + host + ':' + port;
  }
  private indexName() { return this.config.get<string>('ELASTICSEARCH_INDEX_NAME') ?? 'jan_rag_document_chunks'; }

  async ensureIndex() {
    if (this.indexInitialized) return;
    const head = await fetch(this.baseUrl() + '/' + this.indexName(), { method: 'HEAD' }).catch(() => null);
    if (!head || head.status === 404) {
      await fetch(this.baseUrl() + '/' + this.indexName(), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.createIndexBody())
      });
    }
    this.indexInitialized = true;
  }

  async indexReadyChunks(fileName: string, chunks: ChunkRecord[]) {
    await this.ensureIndex();
    for (const chunk of chunks) {
      await fetch(this.baseUrl() + '/' + this.indexName() + '/_doc/' + encodeURIComponent(String(chunk.id)), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunkId: chunk.id, groupId: chunk.groupId, documentId: chunk.documentId, chunkIndex: chunk.chunkIndex, fileName, chunkText: chunk.chunkText, status: 'READY', deleted: false })
      });
    }
  }

  async deleteDocumentChunks(documentId: number) {
    await this.ensureIndex().catch(() => undefined);
    await fetch(this.baseUrl() + '/' + this.indexName() + '/_delete_by_query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: { term: { documentId } } })
    }).catch(() => undefined);
  }

  async search(groupId: number, question: string, topK: number) {
    try {
      await this.ensureIndex();
      const response = await fetch(this.baseUrl() + '/' + this.indexName() + '/_search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.keywordSearchBody(groupId, question, topK))
      });
      if (!response.ok) return [];
      const json = await response.json() as any;
      return (json?.hits?.hits ?? []).map((hit: any) => {
        const source = hit._source ?? {};
        const rawScore = Number(hit._score ?? 0);
        return {
          documentId: Number(source.documentId),
          chunkId: Number(source.chunkId),
          chunkIndex: Number(source.chunkIndex),
          fileName: String(source.fileName ?? ''),
          chunkText: String(source.chunkText ?? ''),
          rawScore,
          normalizedScore: rawScore <= 0 ? 0 : Math.min(1, Math.log1p(rawScore) / Math.log1p(100))
        };
      });
    } catch {
      return [];
    }
  }

  private createIndexBody() {
    return {
      settings: { analysis: { analyzer: { janrag_ik_index: { type: 'custom', tokenizer: 'ik_max_word' }, janrag_ik_search: { type: 'custom', tokenizer: 'ik_smart' } } } },
      mappings: { properties: {
        groupId: { type: 'long' }, documentId: { type: 'long' }, chunkId: { type: 'long' }, chunkIndex: { type: 'integer' }, status: { type: 'keyword' }, deleted: { type: 'boolean' },
        fileName: { type: 'text', analyzer: 'janrag_ik_index', search_analyzer: 'janrag_ik_search', fields: { keyword: { type: 'keyword', ignore_above: 256 } } },
        chunkText: { type: 'text', analyzer: 'janrag_ik_index', search_analyzer: 'janrag_ik_search' }
      } }
    };
  }

  private keywordSearchBody(groupId: number, question: string, topK: number) {
    return {
      size: topK,
      _source: ['groupId', 'documentId', 'chunkId', 'chunkIndex', 'fileName', 'chunkText'],
      query: { bool: { filter: [{ term: { groupId } }, { term: { status: 'READY' } }, { term: { deleted: false } }], should: [
        { match_phrase: { fileName: { query: question, boost: 8 } } },
        { match: { fileName: { query: question, boost: 4 } } },
        { match_phrase: { chunkText: { query: question, boost: 6 } } },
        { match: { chunkText: { query: question, boost: 3 } } }
      ], minimum_should_match: 1 } }
    };
  }
}

@Injectable()
export class QueryPlanningService {
  constructor(private readonly chat: ChatModelService) {}
  async plan(question: string): Promise<string[]> {
    const normalized = compactText(question);
    if (!normalized) throw new BusinessError('question is required');
    const prompt = 'Rewrite or decompose the search question into at most 3 concise retrieval queries. Return JSON only: {"queries":["..."]}. Question: ' + normalized;
    try {
      const raw = await this.chat.complete(prompt);
      if (!raw) return [normalized];
      const parsed = JSON.parse(raw.replace(/^\x60\x60\x60json/i, '').replace(/\x60\x60\x60$/i, '').trim());
      const queries = Array.isArray(parsed.queries) ? parsed.queries.map(compactText).filter(Boolean).slice(0, 3) : [];
      return queries.length ? Array.from(new Set([normalized, ...queries])).slice(0, 3) : [normalized];
    } catch {
      return [normalized];
    }
  }
}

@Injectable()
export class HybridRetrievalService {
  constructor(
    private readonly ds: DataSource,
    private readonly planner: QueryPlanningService,
    private readonly embeddings: EmbeddingService,
    private readonly elasticsearch: ElasticsearchService
  ) {}

  async retrieve(groupId: number, question: string, topK = 5): Promise<{ evidences: Evidence[]; evidenceLevel: string; evidenceGuidance: string; citations: Citation[] }> {
    const queries = await this.planner.plan(question);
    const candidates = new Map<number, any>();
    for (const query of queries) {
      const vectorHits = await this.embeddings.search(groupId, query, 50);
      vectorHits.forEach((hit: any, index: number) => this.mergeCandidate(candidates, hit, 'VECTOR', index + 1, hit.score));
      const keywordHits = await this.elasticsearch.search(groupId, query, 50);
      keywordHits.forEach((hit: any, index: number) => this.mergeCandidate(candidates, hit, 'KEYWORD', index + 1, hit.normalizedScore));
    }
    const ranked = Array.from(candidates.values()).sort((a, b) => b.rankingScore - a.rankingScore || a.chunkId - b.chunkId).slice(0, topK);
    if (!ranked.length) return this.empty();
    const ids = ranked.map(item => item.chunkId);
    const rows = await this.ds.query("select c.group_id as \"groupId\", c.id as \"chunkId\", c.document_id as \"documentId\", c.chunk_index as \"chunkIndex\", c.chunk_text as \"chunkText\", d.file_name as \"fileName\" from document_chunks c join documents d on d.id = c.document_id and d.group_id = c.group_id where c.group_id = $1 and d.status = 'READY' and d.deleted = false and c.id = any($2::bigint[])", [groupId, ids]);
    const rowById = new Map<number, any>(rows.map((row: any) => [Number(row.chunkId), row]));
    const evidences: Evidence[] = [];
    let index = 1;
    for (const candidate of ranked) {
      const row = rowById.get(candidate.chunkId);
      if (!row) continue;
      const text = await this.buildEvidenceWindow(groupId, Number(row.documentId), Number(row.chunkIndex), String(row.fileName));
      evidences.push({ evidenceId: 'E' + index, documentId: Number(row.documentId), chunkId: Number(row.chunkId), chunkIndex: Number(row.chunkIndex), fileName: row.fileName, text, score: candidate.rankingScore, retrievalSource: candidate.source });
      index += 1;
    }
    if (!evidences.length) return this.empty();
    const evidenceLevel = this.evidenceLevel(evidences);
    return { evidences, evidenceLevel, evidenceGuidance: this.guidance(evidenceLevel), citations: this.citations(evidences) };
  }

  private mergeCandidate(candidates: Map<number, any>, hit: any, source: string, rank: number, score: number) {
    const chunkId = Number(hit.chunkId);
    const item = candidates.get(chunkId) ?? { documentId: Number(hit.documentId), chunkId, chunkIndex: Number(hit.chunkIndex), rankingScore: 0, vectorMatched: false, keywordMatched: false, vectorScore: 0, keywordScore: 0 };
    item.rankingScore += 1 / (60 + Math.max(rank, 1));
    if (source === 'VECTOR') { item.vectorMatched = true; item.vectorScore = Math.max(item.vectorScore, Number(score ?? 0)); }
    if (source === 'KEYWORD') { item.keywordMatched = true; item.keywordScore = Math.max(item.keywordScore, Number(score ?? 0)); }
    item.source = item.vectorMatched && item.keywordMatched ? 'BOTH' : item.vectorMatched ? 'VECTOR' : 'KEYWORD';
    candidates.set(chunkId, item);
  }

  private async buildEvidenceWindow(groupId: number, documentId: number, chunkIndex: number, fileName: string) {
    const rows = await this.ds.query('select chunk_text as "chunkText" from document_chunks where group_id = $1 and document_id = $2 and chunk_index between $3 and $4 order by chunk_index asc, id asc', [groupId, documentId, Math.max(0, chunkIndex - 1), chunkIndex + 1]);
    return 'File name: ' + fileName + '\n' + rows.map((row: any) => row.chunkText).join('\n').trim();
  }

  private evidenceLevel(evidences: Evidence[]) {
    if (!evidences.length) return 'NONE';
    const hasBoth = evidences.some(e => e.retrievalSource === 'BOTH');
    if (evidences.length >= 2 && hasBoth) return 'SUFFICIENT';
    if (hasBoth || evidences.length >= 2) return 'PARTIAL';
    return 'WEAK';
  }

  private guidance(level: string) {
    if (level === 'NONE') return 'No available evidence; refuse to answer.';
    if (level === 'WEAK') return 'Evidence relevance is weak; answer cautiously and state limitations.';
    if (level === 'PARTIAL') return 'Evidence is partial; answer only supported parts.';
    return 'Evidence is sufficient; still do not go beyond evidence.';
  }

  private citations(evidences: Evidence[]): Citation[] {
    const byFile = new Map<string, Citation>();
    for (const e of evidences) {
      if (!byFile.has(e.fileName)) byFile.set(e.fileName, { documentId: e.documentId, chunkId: e.chunkId, chunkIndex: e.chunkIndex, fileName: e.fileName, score: e.score, snippet: null });
    }
    return Array.from(byFile.values());
  }

  private empty() {
    return { evidences: [], evidenceLevel: 'NONE', evidenceGuidance: this.guidance('NONE'), citations: [] };
  }
}
