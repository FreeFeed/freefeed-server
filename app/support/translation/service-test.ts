import { TranslationResult } from './types';

export function translate(text: string, targetLang: string): Promise<TranslationResult> {
  return Promise.resolve({
    translatedText: reverse(text),
    detectedLang: reverse(targetLang),
  });
}

function reverse(s: string): string {
  return s.split('').reverse().join('');
}
