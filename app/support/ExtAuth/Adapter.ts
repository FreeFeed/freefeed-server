export type AuthStartParams<A extends object= {}> = {
  provider: string,
  redirectURL: string,
  mode: 'connect' | 'sign-in',
  display?: string;
} & A;

export type AuthFinishParams<Q extends object> = {
  provider: string,
  query: Q,
};

export type Profile = {
  id: string,
  name: string | null,
  email: string | null,
  pictureURL: string | null,
};

export abstract class Adapter<T extends object, S extends object = {}> {
  abstract getAuthorizeURL(startParams: AuthStartParams & S): Promise<string>;
  abstract acceptResponse(finishParams: AuthFinishParams<T>): Promise<{
    params: AuthStartParams,
    profile: Profile,
  }>;
}
