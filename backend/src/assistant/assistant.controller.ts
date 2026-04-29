import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ok } from '../common/api-response';
import { AssistantConversationService, AssistantService, AssistantSessionService } from './assistant.service';

@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('chat')
  async chat(@Req() request: Request, @Body() body: any) {
    return ok(await this.assistant.chat(request, body));
  }

  @Post('chat/stream')
  async stream(@Req() request: Request, @Body() body: any, @Res() response: Response) {
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    await this.assistant.streamChat(request, body, event => {
      response.write('event: ' + event.event + '\n');
      response.write('data: ' + JSON.stringify(event) + '\n\n');
    });
    response.end();
  }
}

@Controller('assistant/sessions')
export class AssistantSessionController {
  constructor(private readonly sessions: AssistantSessionService) {}

  @Post()
  async create(@Req() request: Request) {
    return ok(await this.sessions.createSession(request));
  }

  @Get()
  async list(@Req() request: Request) {
    return this.sessions.listSessions(request);
  }

  @Get(':sessionId')
  async detail(@Req() request: Request, @Param('sessionId') sessionId: string) {
    return this.sessions.getSessionDetail(request, Number(sessionId));
  }

  @Patch(':sessionId')
  async rename(@Req() request: Request, @Param('sessionId') sessionId: string, @Body() body: any) {
    return ok(await this.sessions.renameSession(request, Number(sessionId), body?.title));
  }

  @Delete(':sessionId')
  async remove(@Req() request: Request, @Param('sessionId') sessionId: string) {
    await this.sessions.deleteSession(request, Number(sessionId));
    return ok(null);
  }
}

@Controller('assistant/sessions')
export class AssistantConversationController {
  constructor(private readonly conversation: AssistantConversationService) {}

  @Get(':sessionId/context')
  async context(@Req() request: Request, @Param('sessionId') sessionId: string, @Query('recentLimit') recentLimit?: string) {
    return this.conversation.getConversationContext(request, Number(sessionId), Number(recentLimit ?? 12));
  }
}
