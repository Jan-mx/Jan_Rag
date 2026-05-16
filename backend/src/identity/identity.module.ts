import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IdentityService } from './identity.service';

@Module({
  imports: [DatabaseModule],
  providers: [IdentityService],
  exports: [IdentityService]
})
export class IdentityModule {}
