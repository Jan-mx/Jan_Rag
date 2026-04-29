import { Column, Entity, PrimaryGeneratedColumn, PrimaryColumn } from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'user_code' }) userCode: string;
  @Column({ nullable: true }) username: string;
  @Column({ nullable: true }) email: string;
  @Column({ name: 'display_name' }) displayName: string;
  @Column({ name: 'password_hash', nullable: true }) passwordHash: string;
  @Column({ name: 'system_role' }) systemRole: string;
  @Column() status: string;
  @Column({ name: 'must_change_password' }) mustChangePassword: boolean;
  @Column({ name: 'last_login_at', nullable: true }) lastLoginAt: Date;
}

@Entity('groups')
export class GroupEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'group_code' }) groupCode: string;
  @Column({ name: 'group_name' }) groupName: string;
  @Column({ nullable: true }) description: string;
  @Column({ name: 'owner_user_id', nullable: true }) ownerUserId: string;
  @Column() status: string;
}

@Entity('group_memberships')
export class GroupMembershipEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'user_id' }) userId: string;
  @Column({ name: 'group_id' }) groupId: string;
  @Column() role: string;
}

@Entity('group_invitations')
export class GroupInvitationEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'group_id' }) groupId: string;
  @Column({ name: 'inviter_user_id' }) inviterUserId: string;
  @Column({ name: 'invitee_user_id' }) inviteeUserId: string;
  @Column() status: string;
}

@Entity('group_join_requests')
export class GroupJoinRequestEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'group_id' }) groupId: string;
  @Column({ name: 'applicant_user_id' }) applicantUserId: string;
  @Column() status: string;
}

@Entity('documents')
export class DocumentEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'group_id' }) groupId: string;
  @Column({ name: 'uploader_user_id' }) uploaderUserId: string;
  @Column({ name: 'file_name' }) fileName: string;
  @Column({ name: 'file_ext' }) fileExt: string;
  @Column({ name: 'content_type', nullable: true }) contentType: string;
  @Column({ name: 'file_size' }) fileSize: string;
  @Column({ name: 'storage_bucket' }) storageBucket: string;
  @Column({ name: 'storage_object_key' }) storageObjectKey: string;
  @Column() status: string;
  @Column() deleted: boolean;
  @Column({ name: 'failure_reason', nullable: true }) failureReason: string;
  @Column({ name: 'preview_text', nullable: true }) previewText: string;
}

@Entity('document_chunks')
export class DocumentChunkEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'document_id' }) documentId: string;
  @Column({ name: 'group_id' }) groupId: string;
  @Column({ name: 'chunk_index' }) chunkIndex: number;
  @Column({ name: 'chunk_text' }) chunkText: string;
  @Column({ name: 'chunk_summary', nullable: true }) chunkSummary: string;
  @Column({ name: 'char_start', nullable: true }) charStart: number;
  @Column({ name: 'char_end', nullable: true }) charEnd: number;
  @Column({ name: 'metadata_json', type: 'jsonb', nullable: true }) metadataJson: unknown;
}

@Entity('user_refresh_tokens')
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'user_id' }) userId: string;
  @Column({ name: 'token_id' }) tokenId: string;
  @Column({ name: 'token_hash' }) tokenHash: string;
  @Column({ name: 'expires_at' }) expiresAt: Date;
  @Column({ name: 'revoked_at', nullable: true }) revokedAt: Date;
}

@Entity('assistant_sessions')
export class AssistantSessionEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'user_id' }) userId: string;
  @Column() title: string;
  @Column() status: string;
  @Column({ name: 'last_message_at', nullable: true }) lastMessageAt: Date;
}

@Entity('assistant_messages')
export class AssistantMessageEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ name: 'session_id' }) sessionId: string;
  @Column() role: string;
  @Column({ name: 'tool_mode', nullable: true }) toolMode: string;
  @Column({ name: 'group_id', nullable: true }) groupId: string;
  @Column() content: string;
  @Column({ name: 'structured_payload', type: 'jsonb', nullable: true }) structuredPayload: unknown;
}

@Entity('assistant_session_contexts')
export class AssistantSessionContextEntity {
  @PrimaryColumn({ name: 'session_id', type: 'bigint' }) sessionId: string;
  @Column({ name: 'session_memory', nullable: true }) sessionMemory: string;
  @Column({ name: 'compact_summary', nullable: true }) compactSummary: string;
  @Column({ name: 'context_version' }) contextVersion: number;
}

export const allEntities = [
  UserEntity,
  GroupEntity,
  GroupMembershipEntity,
  GroupInvitationEntity,
  GroupJoinRequestEntity,
  DocumentEntity,
  DocumentChunkEntity,
  RefreshTokenEntity,
  AssistantSessionEntity,
  AssistantMessageEntity,
  AssistantSessionContextEntity
];
