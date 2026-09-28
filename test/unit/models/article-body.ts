import { describe, it } from 'mocha';
import expect from 'unexpected';

import { extractMentions, extractTitle } from '../../../app/models/article-body';

describe('Article Markdown', () => {
  it('should extract the first h1 title as plain text', () => {
    expect(
      extractTitle('Intro\n\n# First *title* with `code`\n\n# Second title'),
      'to be',
      'First title with code',
    );
  });

  it('should use at most the first 255 source characters without an h1', () => {
    expect(extractTitle('a'.repeat(300)), 'to be', 'a'.repeat(255));
  });

  it('should extract unique mentions from text but not code or link destinations', () => {
    expect(
      extractMentions(
        'Hello @Luna and [@mars](https://example.com/@ignored). `@inline`\n\n```\n@code\n```\n\n@luna',
      ),
      'to equal',
      ['luna', 'mars'],
    );
  });
});
