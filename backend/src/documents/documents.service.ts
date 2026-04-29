import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import { BusinessError, compactText, requirePositiveNumber } from '../common/errors';
import { GroupsService } from '../groups/groups.service';
import { StorageService } from '../storage/storage.service';
import { IngestionService } from '../ingestion/ingestion.service';
import { EmbeddingService, ElasticsearchService } from '../retrieval/retrieval.service';

@Injectable()
export class DocumentsService {
  private readonly supported = new Set(['txt', 'md', 'pdf', 'docx']);
  constructor(
    private readonly ds: DataSource,
    private readonly groups: GroupsService,
    private readonly storage: StorageService,
    private readonly ingestion: IngestionService,
    private readonly embeddings: EmbeddingService,
    private readonly elasticsearch: ElasticsearchService
  ) {}

  async upload(request: Request, groupId: number, file: Express.Multer.File): Promise<number> {
    const gid = requirePositiveNumber(groupId, 'groupId');
    const user = await this.groups.requireGroupOwner(request, gid);
    if (!file || file.size <= 0) throw new BusinessError('Uploaded file is required');
    if (file.size > 10 * 1024 * 1024) throw new BusinessError('Uploaded file exceeds size limit');
    const fileName = this.safeFileName(file.originalname);
    const fileExt = this.fileExt(fileName);
    const contentType = file.mimetype || 'application/octet-stream';
    const objectKey = this.ingestion.buildObjectKey(gid, user.userId, fileExt);
    await this.storage.putObject(objectKey, file.buffer, contentType);
    let documentId: number | null = null;
    try {
      const rows = await this.ds.query("insert into documents (group_id, uploader_user_id, file_name, file_ext, content_type, file_size, storage_bucket, storage_object_key, status, deleted, uploaded_at, created_at, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,'PROCESSING',false,now(),now(),now()) returning id", [gid, user.userId, fileName, fileExt, contentType, file.size, this.storage.bucket, objectKey]);
      documentId = Number(rows[0].id);
      await this.ingestion.processDocument(documentId, gid);
      await this.ds.query("update documents set status = 'READY', failure_reason = null, processed_at = now(), updated_at = now() where id = $1 and group_id = $2", [documentId, gid]);
      return documentId;
    } catch (error) {
      if (documentId) {
        await this.embeddings.deleteDocumentVectors(documentId);
        await this.elasticsearch.deleteDocumentChunks(documentId);
        await this.ds.query("update documents set status = 'FAILED', failure_reason = $1, updated_at = now() where id = $2 and group_id = $3", [error instanceof Error ? error.message.slice(0, 512) : 'Upload failed', documentId, gid]).catch(() => undefined);
      }
      await this.storage.deleteObject(this.storage.bucket, objectKey);
      throw error;
    }
  }

  async list(request: Request, query: any) {
    const user = await this.groups.requireGroupReadable(request, query?.groupId ? Number(query.groupId) : await this.currentAnyGroupId(request));
    const params: any[] = [user.userId];
    let sql = "select d.id as \"documentId\", d.group_id as \"groupId\", d.file_name as \"fileName\", d.file_ext as \"fileExt\", d.content_type as \"contentType\", d.file_size as \"fileSize\", d.status, d.failure_reason as \"failureReason\", d.uploaded_at as \"uploadedAt\", d.uploader_user_id as \"uploaderUserId\", u.user_code as \"uploaderUserCode\", u.display_name as \"uploaderDisplayName\", d.preview_text as \"previewText\" from documents d join users u on u.id = d.uploader_user_id join groups g on g.id = d.group_id join group_memberships gm on gm.group_id = d.group_id where d.deleted = false and g.status = 'ACTIVE' and gm.user_id = $1";
    if (query.groupId) { params.push(Number(query.groupId)); sql += ' and d.group_id = $' + params.length; }
    if (query.groupRelation === 'OWNER' || query.groupRelation === 'OWNED') sql += " and gm.role = 'OWNER'";
    if (query.groupRelation === 'MEMBER' || query.groupRelation === 'JOINED') sql += " and gm.role = 'MEMBER'";
    if (compactText(query.fileName)) { params.push('%' + compactText(query.fileName) + '%'); sql += ' and d.file_name like $' + params.length; }
    if (query.uploaderUserId) { params.push(Number(query.uploaderUserId)); sql += ' and d.uploader_user_id = $' + params.length; }
    if (query.status) { params.push(String(query.status).toUpperCase()); sql += ' and d.status = $' + params.length; }
    sql += ' order by d.uploaded_at desc, d.id desc';
    const rows = await this.ds.query(sql, params);
    return rows.map((row: any) => ({ ...row, documentId: Number(row.documentId), groupId: Number(row.groupId), fileSize: Number(row.fileSize), uploaderUserId: row.uploaderUserId == null ? null : Number(row.uploaderUserId) }));
  }

  async softDelete(request: Request, groupId: number, documentId: number) {
    await this.groups.requireGroupOwner(request, groupId);
    const result = await this.ds.query('update documents set deleted = true, updated_at = now() where id = $1 and group_id = $2 and deleted = false returning id', [documentId, groupId]);
    if (!result[0]) throw new BusinessError('Document does not exist or already deleted');
    await this.embeddings.deleteDocumentVectors(documentId);
    await this.elasticsearch.deleteDocumentChunks(documentId);
  }

  async preview(request: Request, groupId: number, documentId: number) {
    await this.groups.requireGroupReadable(request, groupId);
    const rows = await this.ds.query('select id as "documentId", group_id as "groupId", file_name as "fileName", preview_text as "previewText", status from documents where id = $1 and group_id = $2 and deleted = false', [documentId, groupId]);
    const row = rows[0];
    if (!row) throw new BusinessError('Document does not exist or has been deleted');
    if (row.status !== 'READY') throw new BusinessError('Document is not ready for preview');
    if (!row.previewText) throw new BusinessError('Document has no preview content');
    return { documentId: Number(row.documentId), groupId: Number(row.groupId), fileName: row.fileName, previewText: String(row.previewText).slice(0, 200), status: row.status };
  }

  private async currentAnyGroupId(request: Request): Promise<number> {
    const groups = await this.groups.listVisibleGroups(request);
    const first = groups.ownedGroups[0] ?? groups.joinedGroups[0];
    if (!first) throw new BusinessError('Current user has no readable group');
    return Number(first.groupId);
  }

  private safeFileName(name: string) {
    const normalized = compactText(String(name ?? '').split(/[\\/]/).pop());
    if (!normalized || normalized.length > 255) throw new BusinessError('File name is invalid');
    return normalized;
  }

  private fileExt(fileName: string) {
    const index = fileName.lastIndexOf('.');
    if (index <= 0 || index === fileName.length - 1) throw new BusinessError('File extension is invalid');
    const ext = fileName.slice(index + 1).toLowerCase();
    if (!this.supported.has(ext)) throw new BusinessError('File type is not supported');
    return ext;
  }
}
