import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'node:crypto';
import { BusinessError, UnauthorizedError, compactText } from '../common/errors';

export interface CurrentUser {
  userId: number;
  userCode: string;
  displayName: string;
  systemRole: 'ADMIN' | 'USER';
  mustChangePassword: boolean;
}

@Injectable()
export class PasswordService {
  private readonly maxBytes = 72;
  hash(raw: string): string {
    this.assertSafe(raw);
    return bcrypt.hashSync(raw, 10);
  }
  matches(raw: string, hash: string): boolean {
    this.assertSafe(raw);
    return bcrypt.compareSync(raw, hash);
  }
  validatePasswordPolicy(password: string) {
    if (!password || password.length < 8 || Buffer.byteLength(password, 'utf8') > this.maxBytes) {
      throw new BusinessError('Password must be at least 8 characters and no more than 72 bytes');
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new BusinessError('Password must contain both letters and digits');
    }
  }
  private assertSafe(raw: string) {
    if (raw == null || Buffer.byteLength(raw, 'utf8') > this.maxBytes) {
      throw new BusinessError('Password length exceeds bcrypt safe limit of 72 bytes');
    }
  }
}

@Injectable()
export class TokenService {
  constructor(private readonly config: ConfigService) {}
  issueAccessToken(user: CurrentUser): string {
    const secret = this.jwtSecret();
    const expiresInMinutes = Number(this.config.get<string>('ACCESS_TOKEN_EXPIRE_MINUTES') ?? 30);
    return jwt.sign({
      uid: user.userId,
      displayName: user.displayName,
      systemRole: user.systemRole,
      mustChangePassword: user.mustChangePassword
    }, secret, {
      issuer: this.config.get<string>('JWT_ISSUER') ?? 'jan-rag',
      subject: user.userCode,
      expiresIn: expiresInMinutes * 60
    });
  }
  verifyAccessToken(token: string): CurrentUser {
    try {
      const decoded = jwt.verify(token, this.jwtSecret(), { issuer: this.config.get<string>('JWT_ISSUER') ?? 'jan-rag' }) as any;
      return {
        userId: Number(decoded.uid),
        userCode: String(decoded.sub),
        displayName: String(decoded.displayName),
        systemRole: decoded.systemRole === 'ADMIN' ? 'ADMIN' : 'USER',
        mustChangePassword: Boolean(decoded.mustChangePassword)
      };
    } catch (error) {
      throw new UnauthorizedError('access token is invalid or expired');
    }
  }
  private jwtSecret(): string {
    const secret = this.config.get<string>('JWT_SECRET') ?? 'jan-rag-dev-jwt-secret-2026-04-20-32bytes';
    if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('JWT_SECRET must be at least 32 bytes');
    return secret;
  }
}

@Injectable()
export class RefreshTokenService {
  constructor(private readonly ds: DataSource, private readonly password: PasswordService, private readonly config: ConfigService) {}

  async issueToken(userId: number, executor: { query(sql: string, parameters?: any[]): Promise<any> } = this.ds): Promise<string> {
    const tokenId = crypto.randomUUID().replace(/-/g, '');
    const secret = crypto.randomBytes(24).toString('base64url');
    const token = tokenId + '.' + secret;
    const days = Number(this.config.get<string>('REFRESH_TOKEN_EXPIRE_DAYS') ?? 14);
    await executor.query(
      "insert into user_refresh_tokens (user_id, token_id, token_hash, expires_at, created_at) values ($1,$2,$3,now() + ($4 || ' days')::interval,now())",
      [userId, tokenId, this.password.hash(token), days]
    );
    return token;
  }

  async findActiveToken(token: string): Promise<{ id: number; userId: number } | null> {
    const tokenId = this.parseTokenId(token);
    if (!tokenId) return null;
    const rows = await this.ds.query('select id, user_id as "userId", token_hash as "tokenHash", expires_at as "expiresAt", revoked_at as "revokedAt" from user_refresh_tokens where token_id = $1', [tokenId]);
    const row = rows[0];
    if (!row) return null;
    if (!this.password.matches(token, row.tokenHash)) return null;
    if (row.revokedAt || new Date(row.expiresAt).getTime() <= Date.now()) return null;
    return { id: Number(row.id), userId: Number(row.userId) };
  }

  async revokeToken(token: string | undefined | null) {
    if (!token) return;
    const active = await this.findActiveToken(token);
    if (!active) return;
    await this.ds.query('update user_refresh_tokens set revoked_at = now() where id = $1', [active.id]);
  }

  async revokeActiveTokens(userId: number) {
    await this.ds.query('update user_refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null and expires_at > now()', [userId]);
  }

  private parseTokenId(token: string): string | null {
    if (!token || !token.includes('.')) return null;
    const [id, value] = token.trim().split('.', 2);
    return id && value ? id : null;
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly ds: DataSource,
    private readonly password: PasswordService,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly config: ConfigService
  ) {}

  cookieName(): string {
    return this.config.get<string>('REFRESH_COOKIE_NAME') ?? 'JAN_RAG_REFRESH_TOKEN';
  }

  cookieOptions() {
    const days = Number(this.config.get<string>('REFRESH_TOKEN_EXPIRE_DAYS') ?? 14);
    return {
      httpOnly: true,
      secure: (this.config.get<string>('REFRESH_COOKIE_SECURE') ?? 'false') === 'true',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: days * 24 * 60 * 60 * 1000
    };
  }

  clearCookieOptions() {
    return { httpOnly: true, secure: false, sameSite: 'lax' as const, path: '/', maxAge: 0 };
  }

  async login(loginId: string, rawPassword: string) {
    const normalizedLoginId = compactText(loginId);
    if (!normalizedLoginId || !rawPassword) throw new BusinessError('Login id and password are required');
    return this.ds.transaction(async manager => {
      const rows = await manager.query(
        'select id, user_code as "userCode", display_name as "displayName", password_hash as "passwordHash", system_role as "systemRole", status, must_change_password as "mustChangePassword" from users where username = $1 or email = $1 order by id for update',
        [normalizedLoginId]
      );
      if (rows.length !== 1) throw new BusinessError('Invalid account or password');
      const user = rows[0];
      if (user.status === 'DISABLED') throw new BusinessError('Account is disabled');
      if (!user.passwordHash || !this.password.matches(rawPassword, user.passwordHash)) throw new BusinessError('Invalid account or password');
      const currentUser = this.toCurrentUser(user);
      await manager.query('update user_refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null and expires_at > now()', [currentUser.userId]);
      await manager.query('update users set last_login_at = now(), updated_at = now() where id = $1', [currentUser.userId]);
      const refreshToken = await this.refreshTokens.issueToken(currentUser.userId, manager);
      return { accessToken: this.tokens.issueAccessToken(currentUser), refreshToken, currentUser };
    });
  }

  async register(body: any) {
    const username = compactText(body?.username);
    const email = compactText(body?.email);
    const displayName = compactText(body?.displayName);
    const rawPassword = String(body?.password ?? '');
    if (!username || username.length > 64) throw new BusinessError('username is required and must be <= 64 chars');
    if (!email || email.length > 128) throw new BusinessError('email is required and must be <= 128 chars');
    if (!displayName || displayName.length > 128) throw new BusinessError('displayName is required and must be <= 128 chars');
    this.password.validatePasswordPolicy(rawPassword);
    const existing = await this.ds.query('select count(*)::int as count from users where username = $1 or email = $2', [username, email]);
    if (Number(existing[0].count) > 0) throw new BusinessError('username or email already exists');
    await this.ds.query(
      "insert into users (user_code, username, email, display_name, password_hash, system_role, status, must_change_password, created_at, updated_at) values ($1,$1,$2,$3,$4,'USER','ACTIVE',false,now(),now())",
      [username, email, displayName, this.password.hash(rawPassword)]
    );
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) throw new BusinessError('refresh token is missing or invalid');
    const active = await this.refreshTokens.findActiveToken(refreshToken);
    if (!active) throw new BusinessError('refresh token is missing or invalid');
    const user = await this.loadUserById(active.userId);
    if (user.status === 'DISABLED') throw new BusinessError('Account is disabled');
    await this.refreshTokens.revokeToken(refreshToken);
    const nextRefreshToken = await this.refreshTokens.issueToken(user.userId);
    return { accessToken: this.tokens.issueAccessToken(user), refreshToken: nextRefreshToken, currentUser: user };
  }

  async logout(refreshToken: string | undefined) {
    await this.refreshTokens.revokeToken(refreshToken);
  }

  async loadUserById(userId: number): Promise<CurrentUser & { status?: string }> {
    const rows = await this.ds.query(
      'select id, user_code as "userCode", display_name as "displayName", system_role as "systemRole", status, must_change_password as "mustChangePassword" from users where id = $1',
      [userId]
    );
    if (!rows[0]) throw new BusinessError('User does not exist');
    return { ...this.toCurrentUser(rows[0]), status: rows[0].status };
  }

  private toCurrentUser(row: any): CurrentUser {
    return {
      userId: Number(row.id),
      userCode: String(row.userCode),
      displayName: String(row.displayName),
      systemRole: row.systemRole === 'ADMIN' ? 'ADMIN' : 'USER',
      mustChangePassword: Boolean(row.mustChangePassword)
    };
  }
}



