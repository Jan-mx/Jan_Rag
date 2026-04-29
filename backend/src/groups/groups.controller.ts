import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { ok } from '../common/api-response';
import { GroupsService } from './groups.service';

@Controller('groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get('my')
  async my(@Req() request: Request) {
    return this.groups.listVisibleGroups(request);
  }

  @Post()
  async create(@Req() request: Request, @Body() body: any) {
    return ok(await this.groups.createGroup(request, body));
  }

  @Post('join-requests')
  async submitJoinRequest(@Req() request: Request, @Body() body: any) {
    return ok(await this.groups.submitJoinRequest(request, body?.groupCode));
  }

  @Get('join-requests/my')
  async myJoinRequests(@Req() request: Request) {
    return ok(await this.groups.listMyJoinRequests(request));
  }

  @Get(':groupId/join-requests')
  async ownerJoinRequests(@Req() request: Request, @Param('groupId') groupId: string) {
    return ok(await this.groups.listOwnerJoinRequests(request, Number(groupId)));
  }

  @Post(':groupId/join-requests/:requestId/approve')
  async approveJoin(@Req() request: Request, @Param('groupId') groupId: string, @Param('requestId') requestId: string) {
    await this.groups.approveJoinRequest(request, Number(groupId), Number(requestId));
    return ok(null);
  }

  @Post(':groupId/join-requests/:requestId/reject')
  async rejectJoin(@Req() request: Request, @Param('groupId') groupId: string, @Param('requestId') requestId: string) {
    await this.groups.rejectJoinRequest(request, Number(groupId), Number(requestId));
    return ok(null);
  }

  @Post(':groupId/invitations')
  async invite(@Req() request: Request, @Param('groupId') groupId: string, @Body() body: any) {
    return ok(await this.groups.createInvitation(request, Number(groupId), Number(body?.inviteeUserId)));
  }

  @Get(':groupId/members')
  async members(@Req() request: Request, @Param('groupId') groupId: string) {
    return this.groups.listMembers(request, Number(groupId));
  }

  @Delete(':groupId/members/:userId')
  async remove(@Req() request: Request, @Param('groupId') groupId: string, @Param('userId') userId: string) {
    await this.groups.removeMember(request, Number(groupId), Number(userId));
    return ok(null);
  }

  @Post(':groupId/leave')
  async leave(@Req() request: Request, @Param('groupId') groupId: string) {
    await this.groups.leaveGroup(request, Number(groupId));
    return ok(null);
  }
}

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly groups: GroupsService) {}

  @Post(':invitationId/accept')
  async accept(@Req() request: Request, @Param('invitationId') invitationId: string) {
    await this.groups.acceptInvitation(request, Number(invitationId));
    return ok(null);
  }

  @Post(':invitationId/reject')
  async reject(@Req() request: Request, @Param('invitationId') invitationId: string) {
    await this.groups.rejectInvitation(request, Number(invitationId));
    return ok(null);
  }

  @Post(':invitationId/cancel')
  async cancel(@Req() request: Request, @Param('invitationId') invitationId: string) {
    await this.groups.cancelInvitation(request, Number(invitationId));
    return ok(null);
  }
}
