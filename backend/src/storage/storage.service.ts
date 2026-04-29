import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { BusinessError } from '../common/errors';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly client: Client;
  readonly bucket: string;

  constructor(config: ConfigService) {
    const endpoint = config.get<string>('MINIO_ENDPOINT') ?? 'http://localhost:9000';
    const url = new URL(endpoint);
    this.bucket = config.get<string>('MINIO_BUCKET') ?? 'jan-rag-documents';
    this.client = new Client({
      endPoint: url.hostname,
      port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
      useSSL: url.protocol === 'https:',
      accessKey: config.get<string>('MINIO_ACCESS_KEY') ?? 'minioadmin',
      secretKey: config.get<string>('MINIO_SECRET_KEY') ?? 'minioadmin'
    });
  }

  async onModuleInit() {
    const exists = await this.client.bucketExists(this.bucket).catch(() => false);
    if (!exists) await this.client.makeBucket(this.bucket);
  }

  async putObject(objectKey: string, buffer: Buffer, contentType: string) {
    try {
      await this.client.putObject(this.bucket, objectKey, buffer, buffer.length, { 'Content-Type': contentType });
    } catch (error) {
      throw new BusinessError('Object storage upload failed', error);
    }
  }

  async getObjectBuffer(bucket: string, objectKey: string): Promise<Buffer> {
    const stream = await this.client.getObject(bucket, objectKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
  }

  async deleteObject(bucket: string, objectKey: string) {
    await this.client.removeObject(bucket, objectKey).catch(() => undefined);
  }
}
