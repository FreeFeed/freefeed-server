import { createHash } from 'crypto';

import compose from 'koa-compose';
import type { TranslationLimits } from 'config';
import type { Context } from 'koa';

import { authRequired, commentAccessRequired, postAccessRequired } from '../../middlewares';
import { type User, type Post, type Comment, dbAdapter } from '../../../models';
import type { Ctx, UUID } from '../../../support/types';
import { ForbiddenException, ServerErrorException } from '../../../support/exceptions';
import { translate as translateText } from '../../../support/translation/translation';

type TranslationResult = Awaited<ReturnType<typeof translateText>>;

export const getTranslatedBody = compose([
  authRequired(),
  async (ctx: Context, next) => {
    if (ctx.params.commentId) {
      await commentAccessRequired({ mustBeVisible: true })(ctx, next);
    } else if (ctx.params.postId) {
      await postAccessRequired()(ctx, next);
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

    let result = await dbAdapter.cache.get<TranslationResult>(cacheKey);

    if (!result) {
      await checkLimits(ctx.config.translation.limits, user.id);

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
  },
]);

async function checkLimits(limits: TranslationLimits, userId: UUID): Promise<void> {
  const [allUsedChars, userUsedChars] = await Promise.all([
    dbAdapter.getTranslationUsage({ period: 'month' }),
    dbAdapter.getTranslationUsage({ period: 'day', userId }),
  ]);

  if (
    allUsedChars < limits.totalCharactersPerMonth &&
    userUsedChars < limits.userCharactersPerDay
  ) {
    return;
  }

  throw new ForbiddenException(
    'You have reached the limit of allowed translations. Please try again later.',
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
