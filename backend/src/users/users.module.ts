import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IdentityModule } from '../identity/identity.module';
import { AuthModule } from '../auth/auth.module';
import { AccountController, AdminUserController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [DatabaseModule, IdentityModule, AuthModule],
  controllers: [AccountController, AdminUserController],
  providers: [UsersService]
})
export class UsersModule {}
