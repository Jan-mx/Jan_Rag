import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { ok } from '../common/api-response';
import { UsersService } from './users.service';

@Controller('account')
export class AccountController {
  constructor(private readonly users: UsersService) {}

  @Post('change-password')
  async changePassword(@Req() request: Request, @Body() body: any) {
    await this.users.changePassword(request, body);
    return ok(null);
  }
}

@Controller('admin/users')
export class AdminUserController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list(@Req() request: Request) {
    return ok(await this.users.listAdminUsers(request));
  }

  @Get(':userId')
  async detail(@Req() request: Request, @Param('userId') userId: string) {
    return ok(await this.users.getAdminUser(request, Number(userId)));
  }

  @Patch(':userId/status')
  async updateStatus(@Req() request: Request, @Param('userId') userId: string, @Body() body: any) {
    await this.users.updateStatus(request, Number(userId), body?.status);
    return ok(null);
  }

  @Post(':userId/reset-password')
  async resetPassword(@Req() request: Request, @Param('userId') userId: string, @Body() body: any) {
    await this.users.resetPassword(request, Number(userId), body?.newPassword);
    return ok(null);
  }
}
