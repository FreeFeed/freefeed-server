import { pick } from 'lodash';

export function serializeTimeline(timeline) {
  return {
    ...pick(timeline, ['id', 'name', 'createdAt', 'title', 'isInherent']),
    user: timeline.userId,
  };
}
