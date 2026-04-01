export type UserRole = 'admin' | 'user';
export type Theme = 'original' | 'red-white' | 'white-black';

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
