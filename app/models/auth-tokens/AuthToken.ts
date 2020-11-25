import { UUID } from '../../support/types';

/**
 * AuthToken
 * The common subset of all token classes
 */
export abstract class AuthToken {
  readonly hasFullAccess: boolean = false;

  constructor(public readonly userId: UUID) { }

  abstract tokenString(): string;
}
