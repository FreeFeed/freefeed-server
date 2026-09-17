import { join } from 'path';

import configModule from 'config';
import createDebug from 'debug';
import { z } from 'zod';
import { DateTime, Duration } from 'luxon';
import { fromError } from 'zod-validation-error';

import { dbAdapter, User, Job, Post, Comment, JobManager } from '../models';

import { currentConfig } from './app-async-context';
import type { UUID } from './types';

export const WELCOME_DIRECT = 'WELCOME_DIRECT';

export function initHandlers(jobManager: JobManager) {
  jobManager.on(WELCOME_DIRECT, jobHandler);
}

const debugLog = createDebug('freefeed:welcomeDirects');
const errorLog = debugLog.extend('errors');

export type JobPayload = {
  id: string;
  senderId: UUID;
  userId: UUID;
  body: string;
  comment?: string;
  criterion?: { type: string };
};

const entrySchema = z.strictObject({
  id: z.string(),
  delay: z.iso.duration().default('PT0S'),
  skipDays: z.number().int().positive().optional(),
  criterion: z
    .object({
      type: z.string(),
      // ...some other arguments
    })
    .optional(),
  body: z.string(),
  comment: z.string().optional(),
});

const directsConfigSchema = z.strictObject({
  sender: z.string(),
  schedule: z.array(entrySchema),
});

type EntrySchema = z.infer<typeof entrySchema>;

export async function scheduleWelcomeDirects(user: User): Promise<boolean> {
  const directsConfigDir = join(configModule.util.getEnv('NODE_CONFIG_DIR'), 'welcome-directs');
  const directsConfig = configModule.util.loadFileConfigs(directsConfigDir, {
    skipConfigSources: true,
  });

  const { error, data: validatedDirectsConfig } = directsConfigSchema.safeParse(directsConfig);

  if (error) {
    errorLog(`The schedule file has invalid format`, { error: fromError(error) });
    return false;
  }

  const { sender: senderUsername, schedule: entries } = validatedDirectsConfig;

  if (entries.length === 0) {
    // No schedule is configured, so nothing to do
    return false;
  }

  const sender = await dbAdapter.getUserByUsername(senderUsername);

  if (!sender) {
    errorLog(`Sender account does not exist`, { senderUsername });
    throw new Error(`Sender account (${senderUsername}) does not exist`);
  }

  await Promise.all(entries.map((entry) => scheduleEntry(user, sender, entry)));

  return true;
}

async function scheduleEntry(user: User, sender: User, entry: EntrySchema) {
  const tz = currentConfig().ianaTimeZone;
  let time = DateTime.fromJSDate(user.firstInteractionAt ?? new Date()).setZone(tz);

  if (entry.skipDays) {
    time = time.plus({ days: entry.skipDays }).startOf('day');
  }

  time = time.plus(Duration.fromISO(entry.delay));

  await Job.create<JobPayload>(
    WELCOME_DIRECT,
    {
      senderId: sender.id,
      userId: user.id,
      id: entry.id,
      body: entry.body,
      comment: entry.comment,
      criterion: entry.criterion,
    },
    { unlockAt: time.toJSDate(), uniqKey: `${user.id}:${entry.id}` },
  );
}

export async function jobHandler(job: Job<JobPayload>) {
  const { senderId, userId, id, body, comment, criterion } = job.payload;
  const [sender, user] = await Promise.all([
    dbAdapter.getUserById(senderId),
    dbAdapter.getUserById(userId),
  ]);

  if (!sender) {
    errorLog(`Sender does not exist`, { senderId });
    return;
  }

  if (!user) {
    errorLog(`User does not exist`, { userId });
    return;
  }

  const logPayload = {
    jobId: id,
    sender: sender.username,
    receiver: user.username,
  };

  // Check criterion
  if (!criterion) {
    // No criterion, just send the message
  } else if (criterion.type === 'noPosts') {
    const postsCount = await dbAdapter.getUserPostsCount(user.id);

    if (postsCount > 0) {
      debugLog(`User has ${postsCount} posts, skipping`, logPayload);
      return;
    }
  } else if (criterion.type === 'noSubscriptions') {
    const friends = await user.getFriends();
    const ignoreList =
      'ignore' in criterion && Array.isArray(criterion.ignore) ? criterion.ignore : [];
    const maxSubscriptions =
      'maxSubscriptions' in criterion && typeof criterion.maxSubscriptions === 'number'
        ? criterion.maxSubscriptions
        : 0;
    const friendsCount = friends.filter((f) => !ignoreList.includes(f.username)).length;

    if (friendsCount > maxSubscriptions) {
      debugLog(`User has ${friendsCount} friends, skipping`, logPayload);
      return;
    }
  } else {
    debugLog(`Unknown criterion type ${criterion.type}, skipping`, logPayload);
    return;
  }

  // Send message and comment (if any)
  debugLog(`Sending message`, logPayload);
  const [userDirectsId, senderDirectsId] = await Promise.all([
    user.getDirectsTimelineId(),
    sender.getDirectsTimelineId(),
  ]);

  if (!userDirectsId || !senderDirectsId) {
    errorLog(`User or sender has no direct timeline, skipping`, logPayload);
    return;
  }

  const post = new Post({
    userId: sender.id,
    body,
    commentsDisabled: '1',
    timelineIds: [userDirectsId, senderDirectsId],
  });
  await post.create();
  debugLog(`Message sent`, logPayload);

  if (comment) {
    debugLog(`Adding comment`, logPayload);
    const newComment = new Comment({
      body: comment,
      postId: post.id,
      userId: sender.id,
    });
    await newComment.create();
    debugLog(`Comment added`, logPayload);
  }
}
