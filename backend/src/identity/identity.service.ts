import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import { BusinessError, ForbiddenError, UnauthorizedError } from '../common/errors';
import { CurrentUser } from '../auth/auth.service';

@Injectable()
export class IdentityService {
  constructor(private readonly ds: DataSource) {}

  async getRequiredCurrentUser(request: Request): Promise<CurrentUser> {
    const auth = (request as any).authenticatedUser as CurrentUser | undefined;
    if (!auth) throw new UnauthorizedError('Current request is not authenticated');
    const rows = await this.ds.query(
      'select id, user_code as "userCode", display_name as "displayName", system_role as "systemRole", status, must_change_password as "mustChangePassword" from users where id = $1',
      [auth.userId]
    );
    if (!rows[0]) throw new BusinessError('Current user does not exist');
    if (rows[0].status === 'DISABLED') throw new BusinessError('Account is disabled');
    return {
      userId: Number(rows[0].id),
      userCode: rows[0].userCode,
      displayName: rows[0].displayName,
      systemRole: rows[0].systemRole === 'ADMIN' ? 'ADMIN' : 'USER',
      mustChangePassword: Boolean(rows[0].mustChangePassword)
    };
  }

  async requireBusinessUser(request: Request): Promise<CurrentUser> {
    const user = await this.getRequiredCurrentUser(request);
    if (user.systemRole === 'ADMIN') throw new ForbiddenError('System administrators cannot access business workspace');
    return user;
  }

  async requireSystemAdmin(request: Request): Promise<CurrentUser> {
    const user = await this.getRequiredCurrentUser(request);
    if (user.systemRole !== 'ADMIN') throw new ForbiddenError('Current user is not a system administrator');
    return user;
  }
}
