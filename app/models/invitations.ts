// Possible refusal reasons for creating an invitation

// Account is too young for create invitations
export const TOO_SOON = 'TOO_SOON';
// Account creates invitations too often
export const TOO_OFTEN = 'TOO_OFTEN';
// Some other (administrative?) reason
export const DENIED = 'DENIED';

export type RefusalReason = typeof TOO_OFTEN | typeof TOO_SOON | typeof DENIED;
