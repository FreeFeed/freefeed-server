import { beforeEach, describe, it } from 'mocha';
import unexpected from 'unexpected';

import { dbAdapter } from '../../../../app/models';
import type { ArticleDbRowContent } from '../../../../app/models/article';
import type { UUID } from '../../../../app/support/types';
import cleanDB from '../../../dbCleaner';
import { createAttachment } from '../attachment-helpers';
import { createPost } from '../../helpers/posts-and-comments';
import { createUser } from '../../helpers/users';

const expect = unexpected.clone();

describe('Article attachments', () => {
  beforeEach(() => cleanDB(dbAdapter.database));

  const ARTICLE_CONTENT = {
    title: 'Test Article',
    digest: 'test-digest',
    body: { blocks: [] },
  } satisfies ArticleDbRowContent;

  it('should store the article association', async () => {
    const luna = await createUser('luna');
    const article = await dbAdapter.createArticle({ author_id: luna.id, ...ARTICLE_CONTENT });
    const attachment = await createAttachment(luna.id, { name: 'file.txt', content: 'test' });

    await dbAdapter.updateAttachment(attachment.id, { articleId: article.uid });

    expect(await dbAdapter.getAttachmentById(attachment.id), 'to satisfy', {
      articleId: article.uid,
      postId: null,
    });
  });

  it('should replace and clear the article attachments', async () => {
    const luna = await createUser('luna');
    const article = await dbAdapter.createArticle({ author_id: luna.id, ...ARTICLE_CONTENT });
    const first = await createAttachment(luna.id, { name: 'first.txt', content: 'first' });
    const second = await createAttachment(luna.id, { name: 'second.txt', content: 'second' });

    expect(await dbAdapter.getAttachmentById(first.id), 'to satisfy', { articleId: null });
    expect(await article.setAttachments([first.id]), 'to equal', true);
    expect(await dbAdapter.getAttachmentById(first.id), 'to satisfy', {
      articleId: article.uid,
    });

    expect(await article.setAttachments([second.id]), 'to equal', true);
    expect(await dbAdapter.getAttachmentById(first.id), 'to satisfy', { articleId: null });
    expect(await dbAdapter.getAttachmentById(second.id), 'to satisfy', {
      articleId: article.uid,
    });

    expect(await article.setAttachments([]), 'to equal', true);
    expect(await dbAdapter.getAttachmentById(second.id), 'to satisfy', { articleId: null });
  });

  it('should reject unknown and foreign attachments without partial changes', async () => {
    const luna = await createUser('luna');
    const mars = await createUser('mars');
    const article = await dbAdapter.createArticle({ author_id: luna.id, ...ARTICLE_CONTENT });
    const own = await createAttachment(luna.id, { name: 'own.txt', content: 'own' });
    const foreign = await createAttachment(mars.id, { name: 'foreign.txt', content: 'foreign' });
    const unknownId = '00000000-0000-0000-0000-000000000000' as UUID;

    await article.setAttachments([own.id]);

    expect(await article.setAttachments([own.id, foreign.id]), 'to equal', false);
    expect(await article.setAttachments([unknownId]), 'to equal', false);
    expect(await dbAdapter.getAttachmentById(own.id), 'to satisfy', {
      articleId: article.uid,
    });
    expect(await dbAdapter.getAttachmentById(foreign.id), 'to satisfy', { articleId: null });
  });

  it('should reject attachments associated with a post or another article', async () => {
    const luna = await createUser('luna');
    const article = await dbAdapter.createArticle({ author_id: luna.id, ...ARTICLE_CONTENT });
    const otherArticle = await dbAdapter.createArticle({
      author_id: luna.id,
      ...ARTICLE_CONTENT,
    });
    const articleAttachment = await createAttachment(luna.id, {
      name: 'article.txt',
      content: 'article',
    });
    const postAttachment = await createAttachment(luna.id, {
      name: 'post.txt',
      content: 'post',
    });
    const post = await createPost(luna, 'Post body');

    await otherArticle.setAttachments([articleAttachment.id]);
    await dbAdapter.updateAttachment(postAttachment.id, { postId: post.id });

    expect(await article.setAttachments([articleAttachment.id]), 'to equal', false);
    expect(await article.setAttachments([postAttachment.id]), 'to equal', false);
    expect(await dbAdapter.getAttachmentById(articleAttachment.id), 'to satisfy', {
      articleId: otherArticle.uid,
    });
    expect(await dbAdapter.getAttachmentById(postAttachment.id), 'to satisfy', {
      articleId: null,
      postId: post.id,
    });
  });

  it('should not associate an attachment with both an article and a post', async () => {
    const luna = await createUser('luna');
    const article = await dbAdapter.createArticle({ author_id: luna.id, ...ARTICLE_CONTENT });
    const post = await createPost(luna, 'Post body');
    const attachment = await createAttachment(luna.id, { name: 'file.txt', content: 'test' });

    await dbAdapter.updateAttachment(attachment.id, { postId: post.id });

    await expect(
      dbAdapter.updateAttachment(attachment.id, { articleId: article.uid }),
      'to be rejected',
    );
  });

  it('should clear the association when the article is deleted', async () => {
    const luna = await createUser('luna');
    const article = await dbAdapter.createArticle({ author_id: luna.id, ...ARTICLE_CONTENT });
    const attachment = await createAttachment(luna.id, { name: 'file.txt', content: 'test' });

    await article.setAttachments([attachment.id]);
    expect(await dbAdapter.getAttachmentById(attachment.id), 'to satisfy', {
      articleId: article.uid,
    });

    await article.destroy();

    expect(await dbAdapter.getAttachmentById(attachment.id), 'to satisfy', {
      articleId: null,
    });
  });
});
