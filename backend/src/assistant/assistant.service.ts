import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { BusinessError, compactText, requirePositiveNumber } from '../common/errors';
import { IdentityService } from '../identity/identity.service';
import { GroupsService } from '../groups/groups.service';
import { ChatModelService, HybridRetrievalService, Citation } from '../retrieval/retrieval.service';

type ToolMode = 'CHAT' | 'KB_SEARCH';

interface AssistantStreamEvent {
  event: 'start' | 'delta' | 'done' | 'error';
  sessionId: number;
  toolMode: ToolMode;
  groupId: number | null;
  delta: string | null;
  messageId: number | null;
  reply: string | null;
  citations: Citation[];
  error: string | null;
}

@Injectable()
export class AssistantSessionService {
  constructor(private readonly ds: DataSource, private readonly identity: IdentityService) {}

  async createSession(request: Request) {
    const user = await this.identity.requireBusinessUser(request);
    const rows = await this.ds.query("insert into assistant_sessions (user_id, title, status, created_at, updated_at) values ($1,'New conversation','ACTIVE',now(),now()) returning id, title, status, last_message_at as \"lastMessageAt\", created_at as \"createdAt\"", [user.userId]);
    return this.detail(rows[0]);
  }

  async listSessions(request: Request) {
    const user = await this.identity.requireBusinessUser(request);
    const rows = await this.ds.query("select id as \"sessionId\", title, last_message_at as \"lastMessageAt\" from assistant_sessions where user_id = $1 and status <> 'DELETED' order by last_message_at desc nulls last, id desc", [user.userId]);
    return rows.map((row: any) => ({ sessionId: Number(row.sessionId), title: row.title, lastMessageAt: row.lastMessageAt }));
  }

  async getSessionDetail(request: Request, sessionId: number) {
    const user = await this.identity.requireBusinessUser(request);
    const row = await this.requireOwnedSession(user.userId, sessionId);
    return this.detail(row);
  }

  async renameSession(request: Request, sessionId: number, title: string) {
    const user = await this.identity.requireBusinessUser(request);
    const nextTitle = compactText(title);
    if (!nextTitle || nextTitle.length > 255) throw new BusinessError('title is required and must be <= 255 chars');
    const rows = await this.ds.query("update assistant_sessions set title = $1, updated_at = now() where id = $2 and user_id = $3 and status <> 'DELETED' returning id, title, status, last_message_at as \"lastMessageAt\", created_at as \"createdAt\"", [nextTitle, sessionId, user.userId]);
    if (!rows[0]) throw new BusinessError('Session does not exist');
    return this.detail(rows[0]);
  }

  async deleteSession(request: Request, sessionId: number) {
    const user = await this.identity.requireBusinessUser(request);
    await this.requireOwnedSession(user.userId, sessionId);
    await this.ds.transaction(async manager => {
      await manager.query('delete from assistant_session_contexts where session_id = $1', [sessionId]);
      await manager.query('delete from assistant_messages where session_id = $1', [sessionId]);
      await manager.query('delete from assistant_sessions where id = $1 and user_id = $2', [sessionId, user.userId]);
    });
  }

  async requireOwnedSession(userId: number, sessionId: number) {
    const id = requirePositiveNumber(sessionId, 'sessionId');
    const rows = await this.ds.query("select id, title, status, last_message_at as \"lastMessageAt\", created_at as \"createdAt\" from assistant_sessions where id = $1 and user_id = $2 and status <> 'DELETED'", [id, userId]);
    if (!rows[0]) throw new BusinessError('Session does not exist');
    return rows[0];
  }

  async autoRenameIfNeeded(userId: number, sessionId: number, firstMessage: string) {
    const session = await this.requireOwnedSession(userId, sessionId);
    if (session.title !== 'New conversation') return;
    const title = compactText(firstMessage).slice(0, 24) || 'New conversation';
    if (title !== 'New conversation') await this.ds.query('update assistant_sessions set title = $1, updated_at = now() where id = $2 and user_id = $3', [title, sessionId, userId]);
  }

  private detail(row: any) {
    return { sessionId: Number(row.id ?? row.sessionId), title: row.title, status: row.status, lastMessageAt: row.lastMessageAt, createdAt: row.createdAt };
  }
}

@Injectable()
export class AssistantConversationService {
  constructor(private readonly ds: DataSource, private readonly identity: IdentityService, private readonly sessions: AssistantSessionService) {}

  async saveMessage(userId: number, dto: { sessionId: number; role: 'USER' | 'ASSISTANT'; toolMode: ToolMode; groupId: number | null; content: string; structuredPayload?: unknown }) {
    await this.sessions.requireOwnedSession(userId, dto.sessionId);
    const payload = dto.structuredPayload == null ? null : JSON.stringify(dto.structuredPayload);
    const rows = await this.ds.query('insert into assistant_messages (session_id, role, tool_mode, group_id, content, structured_payload, created_at) values ($1,$2,$3,$4,$5,$6::jsonb,now()) returning id, session_id as "sessionId", role, tool_mode as "toolMode", group_id as "groupId", content, structured_payload as "structuredPayload", created_at as "createdAt"', [dto.sessionId, dto.role, dto.toolMode, dto.groupId, dto.content, payload]);
    await this.ds.query('update assistant_sessions set last_message_at = now(), updated_at = now() where id = $1 and user_id = $2', [dto.sessionId, userId]);
    if (dto.role === 'USER') {
      const count = await this.ds.query('select count(*)::int as count from assistant_messages where session_id = $1', [dto.sessionId]);
      if (Number(count[0].count) === 1) await this.sessions.autoRenameIfNeeded(userId, dto.sessionId, dto.content);
    }
    return this.message(rows[0]);
  }

  async loadContext(userId: number, sessionId: number, recentLimit = 12) {
    await this.sessions.requireOwnedSession(userId, sessionId);
    const context = (await this.ds.query('select session_memory as "sessionMemory", compact_summary as "compactSummary" from assistant_session_contexts where session_id = $1', [sessionId]))[0];
    const rows = await this.ds.query('select id, session_id as "sessionId", role, tool_mode as "toolMode", group_id as "groupId", content, structured_payload as "structuredPayload", created_at as "createdAt" from assistant_messages where session_id = $1 order by created_at desc, id desc limit $2', [sessionId, Math.min(Math.max(Number(recentLimit), 1), 100)]);
    return { summaryText: context?.compactSummary ?? context?.sessionMemory ?? null, recentMessages: rows.reverse().map((row: any) => this.message(row)) };
  }

  async getConversationContext(request: Request, sessionId: number, recentLimit: number) {
    const user = await this.identity.requireBusinessUser(request);
    return this.loadContext(user.userId, sessionId, recentLimit);
  }

  private message(row: any) {
    return { messageId: Number(row.id), sessionId: Number(row.sessionId), role: row.role, toolMode: row.toolMode, groupId: row.groupId == null ? null : Number(row.groupId), content: row.content, structuredPayload: row.structuredPayload == null ? null : JSON.stringify(row.structuredPayload), createdAt: row.createdAt };
  }
}

@Injectable()
export class AssistantAgentService {
  constructor(private readonly chat: ChatModelService, private readonly retrieval: HybridRetrievalService, private readonly conversation: AssistantConversationService) {}

  async run(input: { userId: number; sessionId: number; toolMode: ToolMode; groupId: number | null; message: string }, onDelta?: (delta: string) => void): Promise<{ reply: string; citations: Citation[] }> {
    const AgentState = Annotation.Root({
      userId: Annotation<number>(),
      sessionId: Annotation<number>(),
      toolMode: Annotation<ToolMode>(),
      groupId: Annotation<number | null>(),
      message: Annotation<string>(),
      evidenceText: Annotation<string>({ value: (_left, right) => right, default: () => '' }),
      citations: Annotation<Citation[]>({ value: (_left, right) => right, default: () => [] }),
      reply: Annotation<string>({ value: (_left, right) => right, default: () => '' })
    });

    const graph = new StateGraph(AgentState)
      .addNode('knowledge_base_search', async state => {
        if (state.toolMode !== 'KB_SEARCH' || state.groupId == null) return { evidenceText: '', citations: [] };
        const bundle = await this.retrieval.retrieve(state.groupId, state.message, 5);
        return {
          evidenceText: bundle.evidences.map(e => '[' + e.evidenceId + '] ' + e.text).join('\n\n'),
          citations: bundle.citations
        };
      })
      .addNode('model', async state => {
        const context = await this.conversation.loadContext(state.userId, state.sessionId, 12);
        const history = context.recentMessages.map(message => message.role + ': ' + message.content).join('\n');
        const prompt = state.toolMode === 'KB_SEARCH'
          ? 'You are a knowledge base assistant. Answer using only evidence. If evidence is empty, refuse.\nContext summary: ' + (context.summaryText ?? '') + '\nRecent messages:\n' + history + '\nUser: ' + state.message + '\nEvidence:\n' + state.evidenceText
          : 'You are a helpful assistant.\nContext summary: ' + (context.summaryText ?? '') + '\nRecent messages:\n' + history + '\nUser: ' + state.message;
        const reply = onDelta ? await this.chat.streamComplete(prompt, onDelta) : (await this.chat.complete(prompt)) ?? 'No chat model is configured.';
        return { reply };
      })
      .addEdge(START, 'knowledge_base_search')
      .addEdge('knowledge_base_search', 'model')
      .addEdge('model', END)
      .compile();

    const threadId = 'user:' + input.userId + ':session:' + input.sessionId;
    const result = await graph.invoke(input, { configurable: { thread_id: threadId } });
    return { reply: compactText(result.reply), citations: result.citations ?? [] };
  }
}

@Injectable()
export class AssistantService {
  constructor(
    private readonly identity: IdentityService,
    private readonly groups: GroupsService,
    private readonly conversation: AssistantConversationService,
    private readonly agent: AssistantAgentService
  ) {}

  async chat(request: Request, body: any) {
    const user = await this.identity.requireBusinessUser(request);
    const safe = await this.validateRequest(request, body);
    await this.conversation.saveMessage(user.userId, { ...safe, role: 'USER', content: safe.message });
    const result = await this.agent.run({ userId: user.userId, ...safe });
    const saved = await this.conversation.saveMessage(user.userId, { sessionId: safe.sessionId, role: 'ASSISTANT', toolMode: safe.toolMode, groupId: safe.groupId, content: result.reply, structuredPayload: null });
    return { sessionId: safe.sessionId, messageId: saved.messageId, reply: result.reply, toolMode: safe.toolMode, groupId: safe.groupId, citations: result.citations };
  }

  async streamChat(request: Request, body: any, emit: (event: AssistantStreamEvent) => void) {
    const user = await this.identity.requireBusinessUser(request);
    const safe = await this.validateRequest(request, body);
    try {
      await this.conversation.saveMessage(user.userId, { ...safe, role: 'USER', content: safe.message });
      emit(this.event('start', safe));
      const result = await this.agent.run({ userId: user.userId, ...safe }, delta => emit({ ...this.event('delta', safe), delta }));
      const saved = await this.conversation.saveMessage(user.userId, { sessionId: safe.sessionId, role: 'ASSISTANT', toolMode: safe.toolMode, groupId: safe.groupId, content: result.reply, structuredPayload: null });
      emit({ ...this.event('done', safe), messageId: saved.messageId, reply: result.reply, citations: result.citations });
    } catch (error) {
      emit({ ...this.event('error', safe), error: error instanceof Error ? error.message : 'Assistant failed' });
    }
  }

  private async validateRequest(request: Request, body: any): Promise<{ sessionId: number; message: string; toolMode: ToolMode; groupId: number | null }> {
    const sessionId = requirePositiveNumber(body?.sessionId, 'sessionId');
    const message = compactText(body?.message);
    if (!message) throw new BusinessError('message is required');
    const toolMode: ToolMode = body?.toolMode === 'KB_SEARCH' ? 'KB_SEARCH' : 'CHAT';
    const groupId = body?.groupId == null || body?.groupId === '' ? null : requirePositiveNumber(body.groupId, 'groupId');
    if (toolMode === 'CHAT' && groupId != null) throw new BusinessError('CHAT mode does not allow groupId');
    if (toolMode === 'KB_SEARCH') {
      if (groupId == null) throw new BusinessError('KB_SEARCH mode requires groupId');
      await this.groups.requireGroupReadable(request, groupId);
    }
    return { sessionId, message, toolMode, groupId };
  }

  private event(event: AssistantStreamEvent['event'], safe: { sessionId: number; toolMode: ToolMode; groupId: number | null }): AssistantStreamEvent {
    return { event, sessionId: safe.sessionId, toolMode: safe.toolMode, groupId: safe.groupId, delta: null, messageId: null, reply: null, citations: [], error: null };
  }
}
