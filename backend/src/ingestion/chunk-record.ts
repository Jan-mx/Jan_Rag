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
