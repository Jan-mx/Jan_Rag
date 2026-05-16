import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IdentityModule } from '../identity/identity.module';
import { GroupsModule } from '../groups/groups.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import {
  AssistantConversationController,
  AssistantController,
  AssistantSessionController
} from './assistant.controller';
import {
  AssistantAgentService,
  AssistantConversationService,
  AssistantService,
  AssistantSessionService
} from './assistant.service';

@Module({
  imports: [DatabaseModule, IdentityModule, GroupsModule, RetrievalModule],
  controllers: [AssistantController, AssistantSessionController, AssistantConversationController],
  providers: [
    AssistantSessionService,
    AssistantConversationService,
    AssistantAgentService,
    AssistantService
  ]
})
export class AssistantModule {}
