export interface CurrentUser {
  userId: number;
  userCode: string;
  displayName: string;
  systemRole: 'ADMIN' | 'USER';
  mustChangePassword: boolean;
}
