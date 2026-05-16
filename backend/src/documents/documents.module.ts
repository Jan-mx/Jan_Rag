import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { GroupsModule } from '../groups/groups.module';
import { StorageModule } from '../storage/storage.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [DatabaseModule, GroupsModule, StorageModule, IngestionModule, RetrievalModule],
  controllers: [DocumentsController],
  providers: [DocumentsService]
})
export class DocumentsModule {}
