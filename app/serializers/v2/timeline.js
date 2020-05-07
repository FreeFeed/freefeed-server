import { pick } from 'lodash';


export function serializeTimeline(timeline) {
  return pick(timeline, [
    'id',
    'name',
    'userId',
    'createdAt',
    'title',
    'isInherent',
  ]);
}
