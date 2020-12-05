import { IPAddr, Nullable, UUID } from '../../support/types';


export type AppTokenCreateParams = {
  userId: UUID;
  title: string;
  scopes?: string[];
  restrictions?: {
    netmasks?: string[];
    origins?: string[];
  },
  expiresAtSeconds?: number;
};

// AppToken database record
export type AppTokenRecord = Required<AppTokenCreateParams> & {
  id: UUID;
  isActive: boolean;
  issue: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Nullable<Date>;
  lastUsedAt: Nullable<Date>;
  lastIP: Nullable<IPAddr>;
  lastUserAgent: Nullable<string>;
  activationCode: Nullable<string>;
};

export type AppTokenLogPayload = {
  token_id: UUID,
  request: string,
  ip: IPAddr,
  user_agent: string,
  extra: any,
}

export type SessionRecord = {
  id: UUID;
  userId: UUID;
  status: number;
  issue: number;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Nullable<Date>;
  lastIP: Nullable<IPAddr>;
  lastUserAgent: Nullable<string>;
  databaseTime: Date;
};

export type SessionMutableRecord = Partial<Omit<SessionRecord,
  // Immutable fields of SessionRecord
  | 'id'
  | 'userId'
  | 'createdAt'
  | 'databaseTime'
>>
