import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import crypto from 'node:crypto';
import { BusinessError, compactText, requirePositiveNumber } from '../common/errors';
import { IdentityService } from '../identity/identity.service';

@Injectable()
export class GroupsService {
  constructor(private readonly ds: DataSource, private readonly identity: IdentityService) {}

  async listVisibleGroups(request: Request) {
    const user = await this.identity.requireBusinessUser(request);
    const ownedGroups = await this.ds.query("select g.id as \"groupId\", g.group_code as \"groupCode\", g.group_name as \"groupName\" from groups g join group_memberships gm on gm.group_id = g.id where gm.user_id = $1 and gm.role = 'OWNER' and g.status = 'ACTIVE' order by g.id", [user.userId]);
    const joinedGroups = await this.ds.query("select g.id as \"groupId\", g.group_code as \"groupCode\", g.group_name as \"groupName\" from groups g join group_memberships gm on gm.group_id = g.id where gm.user_id = $1 and gm.role = 'MEMBER' and g.status = 'ACTIVE' order by g.id", [user.userId]);
    const pendingInvitations = await this.ds.query("select gi.id as \"invitationId\", gi.group_id as \"groupId\", g.group_name as \"groupName\", gi.inviter_user_id as \"inviterUserId\", u.display_name as \"inviterDisplayName\", gi.status from group_invitations gi join groups g on g.id = gi.group_id join users u on u.id = gi.inviter_user_id where gi.invitee_user_id = $1 and gi.status = 'PENDING' order by gi.created_at desc, gi.id desc", [user.userId]);
    return {
      ownedGroups: ownedGroups.map(this.numberIds),
      joinedGroups: joinedGroups.map(this.numberIds),
      pendingInvitations: pendingInvitations.map(this.numberIds)
    };
  }

  async requireGroupReadable(request: Request, groupId: number) {
    const user = await this.identity.requireBusinessUser(request);
    const id = requirePositiveNumber(groupId, 'groupId');
    const rows = await this.ds.query("select gm.role from group_memberships gm join groups g on g.id = gm.group_id where gm.user_id = $1 and gm.group_id = $2 and g.status = 'ACTIVE'", [user.userId, id]);
    if (!rows[0]) throw new BusinessError('Current user is not a member of target group');
    return user;
  }

  async requireGroupOwner(request: Request, groupId: number) {
    const user = await this.identity.requireBusinessUser(request);
    const id = requirePositiveNumber(groupId, 'groupId');
    const rows = await this.ds.query("select gm.role from group_memberships gm join groups g on g.id = gm.group_id where gm.user_id = $1 and gm.group_id = $2 and g.status = 'ACTIVE'", [user.userId, id]);
    if (!rows[0]) throw new BusinessError('Current user is not a member of target group');
    if (rows[0].role !== 'OWNER') throw new BusinessError('Current user is not target group OWNER');
    return user;
  }

  async createGroup(request: Request, body: any): Promise<number> {
    const user = await this.identity.requireBusinessUser(request);
    const name = compactText(body?.name);
    const description = compactText(body?.description) || null;
    if (!name || name.length > 128) throw new BusinessError('Group name is required and must be <= 128 chars');
    if (description && description.length > 512) throw new BusinessError('Group description must be <= 512 chars');
    return this.ds.transaction(async manager => {
      const rows = await manager.query("insert into groups (group_code, group_name, description, owner_user_id, status, created_at, updated_at) values ($1,$2,$3,$4,'ACTIVE',now(),now()) returning id", ['group-' + crypto.randomUUID().replace(/-/g, ''), name, description, user.userId]);
      const groupId = Number(rows[0].id);
      await manager.query("insert into group_memberships (user_id, group_id, role, created_at, updated_at) values ($1,$2,'OWNER',now(),now())", [user.userId, groupId]);
      return groupId;
    });
  }

  async createInvitation(request: Request, groupId: number, inviteeUserId: number): Promise<number> {
    const owner = await this.requireGroupOwner(request, groupId);
    const gid = requirePositiveNumber(groupId, 'groupId');
    const uid = requirePositiveNumber(inviteeUserId, 'inviteeUserId');
    const users = await this.ds.query('select id from users where id = $1', [uid]);
    if (!users[0]) throw new BusinessError('Invitee user does not exist');
    await this.rejectExistingMembership(gid, uid);
    const pending = await this.ds.query("select count(*)::int as count from group_invitations where group_id = $1 and invitee_user_id = $2 and status = 'PENDING'", [gid, uid]);
    if (Number(pending[0].count) > 0) throw new BusinessError('Pending invitation already exists');
    const rows = await this.ds.query("insert into group_invitations (group_id, inviter_user_id, invitee_user_id, status, created_at, updated_at) values ($1,$2,$3,'PENDING',now(),now()) returning id", [gid, owner.userId, uid]);
    return Number(rows[0].id);
  }

  async listMembers(request: Request, groupId: number) {
    await this.requireGroupOwner(request, groupId);
    const rows = await this.ds.query('select u.id as "userId", u.user_code as "userCode", u.display_name as "displayName", gm.role from group_memberships gm join users u on u.id = gm.user_id where gm.group_id = $1 order by gm.role desc, u.id', [groupId]);
    return rows.map(this.numberIds);
  }

  async removeMember(request: Request, groupId: number, userId: number) {
    await this.requireGroupOwner(request, groupId);
    const rows = await this.ds.query('select role from group_memberships where group_id = $1 and user_id = $2', [groupId, userId]);
    if (!rows[0]) throw new BusinessError('Member does not exist');
    if (rows[0].role === 'OWNER') throw new BusinessError('Cannot remove OWNER');
    await this.ds.query('delete from group_memberships where group_id = $1 and user_id = $2', [groupId, userId]);
  }

  async leaveGroup(request: Request, groupId: number) {
    const user = await this.identity.requireBusinessUser(request);
    const rows = await this.ds.query('select role from group_memberships where group_id = $1 and user_id = $2', [groupId, user.userId]);
    if (!rows[0]) throw new BusinessError('Current user is not a member of target group');
    if (rows[0].role === 'OWNER') throw new BusinessError('OWNER cannot leave own group');
    await this.ds.query('delete from group_memberships where group_id = $1 and user_id = $2', [groupId, user.userId]);
  }

  async acceptInvitation(request: Request, invitationId: number) {
    const user = await this.identity.requireBusinessUser(request);
    await this.ds.transaction(async manager => {
      const inv = (await manager.query('select id, group_id as "groupId", invitee_user_id as "inviteeUserId", status from group_invitations where id = $1 for update', [invitationId]))[0];
      if (!inv || Number(inv.inviteeUserId) !== user.userId) throw new BusinessError('Invitation does not exist');
      if (inv.status !== 'PENDING') throw new BusinessError('Invitation has been processed');
      await manager.query("insert into group_memberships (group_id, user_id, role, created_at, updated_at) values ($1,$2,'MEMBER',now(),now())", [Number(inv.groupId), user.userId]);
      await manager.query("update group_invitations set status = 'ACCEPTED', updated_at = now() where id = $1", [invitationId]);
    });
  }

  async rejectInvitation(request: Request, invitationId: number) {
    const user = await this.identity.requireBusinessUser(request);
    const inv = (await this.ds.query('select id, invitee_user_id as "inviteeUserId", status from group_invitations where id = $1', [invitationId]))[0];
    if (!inv || Number(inv.inviteeUserId) !== user.userId) throw new BusinessError('Invitation does not exist');
    if (inv.status !== 'PENDING') throw new BusinessError('Invitation has been processed');
    await this.ds.query("update group_invitations set status = 'REJECTED', updated_at = now() where id = $1", [invitationId]);
  }

  async cancelInvitation(request: Request, invitationId: number) {
    const inv = (await this.ds.query('select id, group_id as "groupId", status from group_invitations where id = $1', [invitationId]))[0];
    if (!inv) throw new BusinessError('Invitation does not exist');
    await this.requireGroupOwner(request, Number(inv.groupId));
    if (inv.status !== 'PENDING') throw new BusinessError('Invitation has been processed');
    await this.ds.query("update group_invitations set status = 'CANCELED', updated_at = now() where id = $1", [invitationId]);
  }

  async submitJoinRequest(request: Request, groupCode: string): Promise<number> {
    const user = await this.identity.requireBusinessUser(request);
    const code = compactText(groupCode);
    if (!code) throw new BusinessError('groupCode is required');
    const group = (await this.ds.query("select id from groups where group_code = $1 and status = 'ACTIVE'", [code]))[0];
    if (!group) throw new BusinessError('groupCode does not exist');
    const groupId = Number(group.id);
    await this.rejectExistingMembership(groupId, user.userId);
    const pending = await this.ds.query("select count(*)::int as count from group_join_requests where group_id = $1 and applicant_user_id = $2 and status = 'PENDING'", [groupId, user.userId]);
    if (Number(pending[0].count) > 0) throw new BusinessError('Pending join request already exists');
    const rows = await this.ds.query("insert into group_join_requests (group_id, applicant_user_id, status, created_at, updated_at) values ($1,$2,'PENDING',now(),now()) returning id", [groupId, user.userId]);
    return Number(rows[0].id);
  }

  async listMyJoinRequests(request: Request) {
    const user = await this.identity.requireBusinessUser(request);
    const rows = await this.ds.query('select r.id as "requestId", r.group_id as "groupId", g.group_code as "groupCode", g.group_name as "groupName", r.status, r.created_at as "createdAt", r.decided_at as "decidedAt" from group_join_requests r join groups g on g.id = r.group_id where r.applicant_user_id = $1 order by r.created_at desc, r.id desc', [user.userId]);
    return rows.map(this.numberIds);
  }

  async listOwnerJoinRequests(request: Request, groupId: number) {
    await this.requireGroupOwner(request, groupId);
    const rows = await this.ds.query("select r.id as \"requestId\", r.group_id as \"groupId\", r.applicant_user_id as \"applicantUserId\", u.user_code as \"applicantUserCode\", u.display_name as \"applicantDisplayName\", r.status, r.created_at as \"createdAt\" from group_join_requests r join users u on u.id = r.applicant_user_id where r.group_id = $1 and r.status = 'PENDING' order by r.created_at asc, r.id asc", [groupId]);
    return rows.map(this.numberIds);
  }

  async approveJoinRequest(request: Request, groupId: number, requestId: number) {
    const owner = await this.requireGroupOwner(request, groupId);
    await this.ds.transaction(async manager => {
      const row = (await manager.query('select id, group_id as "groupId", applicant_user_id as "applicantUserId", status from group_join_requests where id = $1 for update', [requestId]))[0];
      if (!row || Number(row.groupId) !== Number(groupId)) throw new BusinessError('Join request does not exist');
      if (row.status !== 'PENDING') throw new BusinessError('Join request has been processed');
      await manager.query("insert into group_memberships (group_id, user_id, role, created_at, updated_at) values ($1,$2,'MEMBER',now(),now())", [groupId, Number(row.applicantUserId)]);
      await manager.query("update group_join_requests set status = 'APPROVED', decided_by_user_id = $1, decided_at = now(), updated_at = now() where id = $2", [owner.userId, requestId]);
    });
  }

  async rejectJoinRequest(request: Request, groupId: number, requestId: number) {
    const owner = await this.requireGroupOwner(request, groupId);
    const row = (await this.ds.query('select id, group_id as "groupId", status from group_join_requests where id = $1', [requestId]))[0];
    if (!row || Number(row.groupId) !== Number(groupId)) throw new BusinessError('Join request does not exist');
    if (row.status !== 'PENDING') throw new BusinessError('Join request has been processed');
    await this.ds.query("update group_join_requests set status = 'REJECTED', decided_by_user_id = $1, decided_at = now(), updated_at = now() where id = $2", [owner.userId, requestId]);
  }

  private async rejectExistingMembership(groupId: number, userId: number) {
    const rows = await this.ds.query('select count(*)::int as count from group_memberships where group_id = $1 and user_id = $2', [groupId, userId]);
    if (Number(rows[0].count) > 0) throw new BusinessError('User is already a group member');
  }

  private numberIds(row: any) {
    for (const key of Object.keys(row)) {
      if (key.endsWith('Id') || key === 'groupId' || key === 'userId' || key === 'requestId' || key === 'invitationId') {
        row[key] = row[key] == null ? null : Number(row[key]);
      }
    }
    return row;
  }
}
