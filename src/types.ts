export type UserRole = 'admin' | 'user';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface AccessCode {
  code: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
  usedBy?: string;
  isPermanent?: boolean;
}
