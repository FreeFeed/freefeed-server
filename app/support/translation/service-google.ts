import type { TranslationResult } from './types';

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
      format: 'text',
    }),
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-goog-api-key': apiKey,
    },
  });

  const body = await resp.json();

  if (!resp.ok) {
    throw new Error((body && body.error?.message) || `Translation service error ${resp.status}`);
  }

  const [result] = body.data.translations;
  return {
    translatedText: result.translatedText,
    detectedLang: result.detectedSourceLanguage,
  };
}
