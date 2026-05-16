import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { IngestionService } from './ingestion.service';

@Module({
  imports: [DatabaseModule, StorageModule, RetrievalModule],
  providers: [IngestionService],
  exports: [IngestionService]
})
export class IngestionModule {}
