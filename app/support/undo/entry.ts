import { Duration } from 'luxon';
import jwt from 'jsonwebtoken';

type JwtPayload = jwt.JwtPayload;

import { currentConfig } from '../app-async-context';
import type { UUID } from '../types';

export type SerializedUndoEntry<Subj extends string> = {
  subject: Subj;
  message: string;
  messageParams?: object;
  token: string;
  expiresInSec: number;
};

const audVersion = 1;

export const tokenAudience = `freefeed:undo:v${audVersion}`;

export abstract class UndoEntry<Subj extends string, Payload extends object = object> {
  public readonly subject: Subj;

  constructor(subject: Subj) {
    this.subject = subject;
  }

  public abstract serialize(
    issuer: UUID,
    message: string,
    extra: object,
  ): SerializedUndoEntry<Subj>;

  public static get ttlSec(): number {
    return Duration.fromISO(currentConfig().undo.undoInterval).as('seconds');
  }

  protected createUndoEntry(
    issuer: UUID,
    tokenPayload: Payload,
    message: string,
    messageParams?: object,
  ): SerializedUndoEntry<Subj> {
    return {
      subject: this.subject,
      message,
      messageParams,
      token: this.createToken(issuer, tokenPayload),
      expiresInSec: UndoEntry.ttlSec,
    };
  }

  private createToken(issuer: UUID, payload: object) {
    return jwt.sign(payload, currentConfig().secret, {
      subject: this.subject,
      issuer,
      audience: tokenAudience,
      expiresIn: UndoEntry.ttlSec,
    });
  }
}

export function verifyUndoToken(
  token: string,
  issuer: UUID,
  expectedSubject?: string,
): Promise<JwtPayload> {
  return new Promise<JwtPayload>((resolve, reject) => {
    jwt.verify(
      token,
      currentConfig().secret,
      {
        audience: tokenAudience,
        issuer,
      },
      (error, decoded) => {
        if (error) {
          reject(error);
        } else if (decoded) {
          if (expectedSubject && (decoded as JwtPayload).sub !== expectedSubject) {
            reject(new Error('Wrong subject in token'));
          }

          resolve(decoded as JwtPayload);
        }
      },
    );
  });
}
