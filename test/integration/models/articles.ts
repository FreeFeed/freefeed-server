import { beforeEach, describe, it } from 'mocha';
import unexpected from 'unexpected';
import unexpectedDate from 'unexpected-date';

import { dbAdapter, User } from '../../../app/models';
import cleanDB from '../../dbCleaner';
import { createUser } from '../helpers/users';
import { Article } from '../../../app/models/article';
import type { ArticleDbRowContent } from '../../../app/models/article';

const expect = unexpected.clone();
expect.use(unexpectedDate);

describe('Articles model', () => {
  beforeEach(() => cleanDB(dbAdapter.database));

  const ARTICLE_CONTENT = {
    title: 'Test Article',
    slug: 'test-article',
    digest: 'test-digest',
    body: { blocks: [{ type: 'test', content: 'Test content' }] },
  } satisfies ArticleDbRowContent;

  let luna: User;
  let article: Article;
  beforeEach(async () => {
    luna = await createUser('luna');
    article = await dbAdapter.createArticle({ author_id: luna.id, ...ARTICLE_CONTENT });
  });

  it('should create a valid article', () => {
    expect(article, 'not to be null');
    expect(article, 'to satisfy', {
      authorId: luna.id,
      ...ARTICLE_CONTENT,
      createdAt: expect.it('to be a date'),
      updatedAt: expect.it('to be a date'),
      version: 1,
      postId: null,
    });
  });
});
