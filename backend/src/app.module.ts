import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthController } from './auth/auth.controller';
import { AccountController, AdminUserController } from './users/users.controller';
import { GroupsController, InvitationsController } from './groups/groups.controller';
import { DocumentsController } from './documents/documents.controller';
import { QaController } from './qa/qa.controller';
import { AssistantController, AssistantSessionController, AssistantConversationController } from './assistant/assistant.controller';
import { PasswordService, TokenService, RefreshTokenService, AuthService } from './auth/auth.service';
import { IdentityService } from './identity/identity.service';
import { UsersService } from './users/users.service';
import { GroupsService } from './groups/groups.service';
import { StorageService } from './storage/storage.service';
import { IngestionService } from './ingestion/ingestion.service';
import { DocumentsService } from './documents/documents.service';
import { ChatModelService, EmbeddingService, ElasticsearchService, HybridRetrievalService, QueryPlanningService } from './retrieval/retrieval.service';
import { QaService } from './qa/qa.service';
import { AssistantService, AssistantAgentService, AssistantSessionService, AssistantConversationService } from './assistant/assistant.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule
  ],
  controllers: [
    AuthController,
    AccountController,
    AdminUserController,
    GroupsController,
    InvitationsController,
    DocumentsController,
    QaController,
    AssistantController,
    AssistantSessionController,
    AssistantConversationController
  ],
  providers: [
    PasswordService,
    TokenService,
    RefreshTokenService,
    AuthService,
    IdentityService,
    UsersService,
    GroupsService,
    StorageService,
    IngestionService,
    DocumentsService,
    ChatModelService,
    EmbeddingService,
    ElasticsearchService,
    HybridRetrievalService,
    QueryPlanningService,
    QaService,
    AssistantService,
    AssistantAgentService,
    AssistantSessionService,
    AssistantConversationService,
    { provide: APP_GUARD, useClass: AuthGuard }
  ]
})
export class AppModule {}
