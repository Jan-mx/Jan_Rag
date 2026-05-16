import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IdentityModule } from '../identity/identity.module';
import { GroupsController, InvitationsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [GroupsController, InvitationsController],
  providers: [GroupsService],
  exports: [GroupsService]
})
export class GroupsModule {}
