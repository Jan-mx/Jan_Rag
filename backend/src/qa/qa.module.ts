import { Module } from '@nestjs/common';
import { GroupsModule } from '../groups/groups.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { QaController } from './qa.controller';
import { QaService } from './qa.service';

@Module({
  imports: [GroupsModule, RetrievalModule],
  controllers: [QaController],
  providers: [QaService]
})
export class QaModule {}
