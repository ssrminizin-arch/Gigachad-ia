export type UserRole = 'admin' | 'user';
export type Theme = 'original' | 'red-white' | 'white-black';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  createdAt: string;
  lastIp?: string;
  accessExpiresAt?: string;
}

export interface Message {
  id?: string;
  role: 'user' | 'model';
  content: string;
  imageData?: string;
  createdAt: string;
}

export interface Chat {
  id: string;
  userId: string;
  title: string;
  lastMessageAt: string;
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
