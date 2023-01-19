import { User } from '../../app/models';

export type UserCtx = {
  authToken: string;
  username: string;
  password: string;
  user: User;
  attributes: { email: string };
};

export function createTestUser(username?: string): Promise<UserCtx>;
export function createTestUsers(usernames: string[]): Promise<UserCtx[]>;

export function performJSONRequest(
  method: string,
  path: string,
  body?: any,
  header?: Record<string, string>,
): Promise<{ __httpCode: number }>;

export function authHeaders(userCtx: UserCtx | null): { Authorization?: `Bearer ${string}` };

export function cmpBy<T>(key: keyof T): (a: T, b: T) => number;
