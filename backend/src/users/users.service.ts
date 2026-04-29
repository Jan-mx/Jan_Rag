import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import { BusinessError, requirePositiveNumber } from '../common/errors';
import { IdentityService } from '../identity/identity.service';
import { PasswordService, RefreshTokenService } from '../auth/auth.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly ds: DataSource,
    private readonly identity: IdentityService,
    private readonly password: PasswordService,
    private readonly refreshTokens: RefreshTokenService
  ) {}

  async changePassword(request: Request, body: any) {
    const user = await this.identity.getRequiredCurrentUser(request);
    const currentPassword = String(body?.currentPassword ?? '');
    const newPassword = String(body?.newPassword ?? '');
    this.password.validatePasswordPolicy(newPassword);
    const rows = await this.ds.query('select password_hash as "passwordHash" from users where id = $1', [user.userId]);
    if (!rows[0]?.passwordHash) throw new BusinessError('User does not exist');
    if (!this.password.matches(currentPassword, rows[0].passwordHash)) throw new BusinessError('Current password is incorrect');
    if (currentPassword === newPassword) throw new BusinessError('New password must differ from current password');
    await this.ds.query('update users set password_hash = $1, must_change_password = false, updated_at = now() where id = $2', [this.password.hash(newPassword), user.userId]);
    await this.refreshTokens.revokeActiveTokens(user.userId);
  }

  async listAdminUsers(request: Request) {
    await this.identity.requireSystemAdmin(request);
    const rows = await this.ds.query('select id as "userId", user_code as "userCode", username, email, display_name as "displayName", system_role as "systemRole", status, must_change_password as "mustChangePassword", last_login_at as "lastLoginAt" from users order by id');
    return rows.map((row: any) => ({ ...row, userId: Number(row.userId) }));
  }

  async getAdminUser(request: Request, userId: number) {
    await this.identity.requireSystemAdmin(request);
    const id = requirePositiveNumber(userId, 'userId');
    const rows = await this.ds.query('select id as "userId", user_code as "userCode", username, email, display_name as "displayName", system_role as "systemRole", status, must_change_password as "mustChangePassword", last_login_at as "lastLoginAt" from users where id = $1', [id]);
    if (!rows[0]) throw new BusinessError('User does not exist');
    return { ...rows[0], userId: Number(rows[0].userId) };
  }

  async updateStatus(request: Request, userId: number, status: string) {
    await this.identity.requireSystemAdmin(request);
    const id = requirePositiveNumber(userId, 'userId');
    if (!['ACTIVE', 'DISABLED'].includes(status)) throw new BusinessError('status is invalid');
    const result = await this.ds.query('update users set status = $1, updated_at = now() where id = $2 returning id', [status, id]);
    if (!result[0]) throw new BusinessError('User does not exist');
    if (status === 'DISABLED') await this.refreshTokens.revokeActiveTokens(id);
  }

  async resetPassword(request: Request, userId: number, newPassword: string) {
    await this.identity.requireSystemAdmin(request);
    const id = requirePositiveNumber(userId, 'userId');
    this.password.validatePasswordPolicy(String(newPassword ?? ''));
    const result = await this.ds.query('update users set password_hash = $1, must_change_password = true, updated_at = now() where id = $2 returning id', [this.password.hash(newPassword), id]);
    if (!result[0]) throw new BusinessError('User does not exist');
    await this.refreshTokens.revokeActiveTokens(id);
  }
}
