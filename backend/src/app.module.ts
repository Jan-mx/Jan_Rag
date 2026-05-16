import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { IdentityModule } from './identity/identity.module';
import { UsersModule } from './users/users.module';
import { GroupsModule } from './groups/groups.module';
import { StorageModule } from './storage/storage.module';
import { RetrievalModule } from './retrieval/retrieval.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { DocumentsModule } from './documents/documents.module';
import { QaModule } from './qa/qa.module';
import { AssistantModule } from './assistant/assistant.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    IdentityModule,
    UsersModule,
    GroupsModule,
    StorageModule,
    RetrievalModule,
    IngestionModule,
    DocumentsModule,
    QaModule,
    AssistantModule
  ]
})
export class AppModule {}
