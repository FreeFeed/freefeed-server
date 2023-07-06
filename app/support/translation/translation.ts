import { Config } from 'config';

import type { TranslationResult } from './types';
import { translate as testTranslate } from './service-test';
import { translate as googleTranslate } from './service-google';

export function translate(
  text: string,
  targetLang: string,
  { translation }: Config,
): Promise<TranslationResult> {
  if (!translation.enabled) {
    throw new Error('Translation service is disabled.');
  }

  switch (translation.service) {
    case 'google':
      return googleTranslate(text, targetLang, translation.apiKey);
    case 'test':
      return testTranslate(text, targetLang);
    default: {
      // We should never reach this, it just a guard to ensure that switch is
      // exhaustive.
      const t: never = translation;
      throw new Error(`Service not supported ${t}`);
    }
  }
}
