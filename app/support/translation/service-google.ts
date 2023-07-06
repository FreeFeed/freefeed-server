import fetch from 'node-fetch';

import { TranslationResult } from './types';

export async function translate(
  text: string,
  targetLang: string,
  apiKey: string,
): Promise<TranslationResult> {
  const resp = await fetch('https://translation.googleapis.com/language/translate/v2', {
    method: 'POST',
    body: JSON.stringify({
      q: text,
      target: targetLang,
    }),
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-goog-api-key': apiKey,
    },
  });

  const body = await resp.json();

  if (!resp.ok) {
    throw new Error(
      (body && (body as any).error?.message) || `Translation service error ${resp.status}`,
    );
  }

  const [result] = (body as any).data.translations;
  return {
    translatedText: result.translatedText,
    detectedLang: result.detectedSourceLanguage,
  };
}
