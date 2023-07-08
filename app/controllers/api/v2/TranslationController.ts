import { createHash } from 'crypto';

import monitor from 'monitor-dog';
import compose from 'koa-compose';
import type { TranslationLimits } from 'config';
import type { Context } from 'koa';

import {
  authRequired,
  commentAccessRequired,
  monitored,
  postAccessRequired,
} from '../../middlewares';
import { type User, type Post, type Comment, dbAdapter } from '../../../models';
import type { Ctx, UUID } from '../../../support/types';
import { ForbiddenException, ServerErrorException } from '../../../support/exceptions';
import { translate as translateText } from '../../../support/translation/translation';

type TranslationResult = Awaited<ReturnType<typeof translateText>>;

export const getTranslatedBody = compose([
  authRequired(),
  async (ctx: Context, next) => {
    if (ctx.params.commentId) {
      await compose([
        monitored('translated-body', { entity: 'comment' }),
        commentAccessRequired({ mustBeVisible: true }),
      ])(ctx, next);
    } else if (ctx.params.postId) {
      await compose([monitored('translated-body', { entity: 'post' }), postAccessRequired()])(
        ctx,
        next,
      );
    } else {
      throw new ServerErrorException(
        `Server misconfiguration: the required parameters 'postId' or 'commentId' are missing`,
      );
    }
  },
  async (ctx: Ctx<{ user: User; post?: Post; comment?: Comment }>): Promise<void> => {
    const { user } = ctx.state;

    if (!ctx.config.translation.enabled) {
      throw new ForbiddenException('Translation is disabled on this server');
    }

    const targetLang = getTargetLang(ctx);
    const text = (ctx.state.comment ? ctx.state.comment.body : ctx.state.post?.body) ?? '';

    if (!text) {
      ctx.body = {
        translatedText: '',
        detectedLang: targetLang,
      } as TranslationResult;
      return;
    }

    const cacheKey = createHash('sha1').update(text).update(':').update(targetLang).digest('hex');

    let result: TranslationResult | undefined;
    let cacheHit = true;
    let overQuote = false;

    try {
      result = await dbAdapter.cache.get<TranslationResult>(cacheKey);

      if (!result) {
        cacheHit = false;

        if (await isOverQuote(ctx.config.translation.limits, user.id)) {
          overQuote = true;
          throw new ForbiddenException(
            'You have reached the limit of allowed translations. Please try again later.',
          );
        }

        result = await translateText(text, targetLang, ctx.config);

        await Promise.all([
          // Save the translation in the cache
          dbAdapter.cache.set(cacheKey, result),
          // Update usage data
          dbAdapter.registerTranslationUsage({ period: 'month', characters: text.length }),
          dbAdapter.registerTranslationUsage({
            period: 'day',
            userId: user.id,
            characters: text.length,
          }),
        ]);
      }

      ctx.body = result;
    } finally {
      const statTags = {
        detectedLang: result?.detectedLang ?? '',
        targetLang,
        cacheHit: cacheHit ? 'true' : 'false',
        overQuote: overQuote ? 'true' : 'false',
      };

      monitor.increment('translation-usage', text.length, statTags);
      monitor.increment('translation-requests', 1, statTags);
    }
  },
]);

async function isOverQuote(limits: TranslationLimits, userId: UUID): Promise<boolean> {
  const [allUsedChars, userUsedChars] = await Promise.all([
    dbAdapter.getTranslationUsage({ period: 'month' }),
    dbAdapter.getTranslationUsage({ period: 'day', userId }),
  ]);

  return (
    allUsedChars > limits.totalCharactersPerMonth || userUsedChars > limits.userCharactersPerDay
  );
}

function getTargetLang(ctx: Ctx): string {
  let { lang } = ctx.request.query;

  if (Array.isArray(lang)) {
    [lang] = lang;
  }

  if (!lang) {
    [lang] = ctx.request.acceptsLanguages();
  }

  if (!lang || lang === '*') {
    lang = 'en';
  }

  return lang;
}
