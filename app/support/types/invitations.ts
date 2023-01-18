import { ISO8601DurationString } from './branded';

export type InvitationCreationCriterion =
  | ['minAccountAge', { age: ISO8601DurationString }]
  | ['maxInvitesCreated', { count: number; interval: ISO8601DurationString }]
  | ['minPostsCreated' | 'minCommentsFromOthers', { count: number }];
