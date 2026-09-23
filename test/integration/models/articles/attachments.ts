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

const content = (attachmentIds: UUID[]): ArticleDbRowContent => ({
  title: 'Test Article',
  digest: '',
  body: {
    blocks: attachmentIds.map((attachmentId, index) => ({
      id: String(index),
      type: 'media',
      attachmentId,
    })),
  },
});

describe('Article body attachments', () => {
  beforeEach(() => cleanDB(dbAdapter.database));

  it('should link referenced attachments on creation', async () => {
    const luna = await createUser('luna');
    const attachment = await createAttachment(luna.id, { name: 'file.txt', content: 'test' });
    await dbAdapter.getAttachmentById(attachment.id);

    const article = await dbAdapter.createArticle({
      author_id: luna.id,
      ...content([attachment.id]),
    });

    expect(await dbAdapter.getAttachmentById(attachment.id), 'to satisfy', {
      articleId: article.uid,
      postId: null,
    });
  });

  it('should roll back creation when a referenced attachment is unavailable', async () => {
    const luna = await createUser('luna');
    const mars = await createUser('mars');
    const own = await createAttachment(luna.id, { name: 'own.txt', content: 'own' });
    const foreign = await createAttachment(mars.id, { name: 'foreign.txt', content: 'foreign' });
    const occupied = await createAttachment(luna.id, { name: 'occupied.txt', content: 'occupied' });
    const otherArticle = await dbAdapter.createArticle({
      author_id: luna.id,
      ...content([occupied.id]),
    });
    const unknownId = '00000000-0000-0000-0000-000000000000' as UUID;

    await Promise.all(
      [unknownId, foreign.id, occupied.id].map((id) =>
        expect(
          dbAdapter.createArticle({ author_id: luna.id, ...content([own.id, id]) }),
          'to be rejected with error satisfying',
          {
            status: 422,
            message: 'Some article attachments are unavailable',
          },
        ),
      ),
    );

    expect(await dbAdapter.database('articles').where({ author_id: luna.id }), 'to have length', 1);
    expect(await dbAdapter.getAttachmentById(own.id), 'to satisfy', { articleId: null });
    expect(await dbAdapter.getAttachmentById(occupied.id), 'to satisfy', {
      articleId: otherArticle.uid,
    });
  });

  it('should replace and clear references on update', async () => {
    const luna = await createUser('luna');
    const first = await createAttachment(luna.id, { name: 'first.txt', content: 'first' });
    const second = await createAttachment(luna.id, { name: 'second.txt', content: 'second' });
    const article = await dbAdapter.createArticle({ author_id: luna.id, ...content([first.id]) });
    await dbAdapter.getAttachmentById(first.id);
    await dbAdapter.getAttachmentById(second.id);

    expect(await article.update(1, content([second.id])), 'to equal', {
      status: 'updated',
      version: 2,
    });
    expect(await dbAdapter.getAttachmentById(first.id), 'to satisfy', { articleId: null });
    expect(await dbAdapter.getAttachmentById(second.id), 'to satisfy', {
      articleId: article.uid,
    });

    expect(await article.update(2, content([])), 'to equal', { status: 'updated', version: 3 });
    expect(await dbAdapter.getAttachmentById(second.id), 'to satisfy', { articleId: null });
  });

  it('should keep a shared media and gallery attachment until its last reference is removed', async () => {
    const luna = await createUser('luna');
    const attachment = await createAttachment(luna.id, { name: 'file.txt', content: 'test' });
    const gallery = {
      id: 'gallery',
      type: 'gallery' as const,
      items: [{ attachmentId: attachment.id }],
    };
    const article = await dbAdapter.createArticle({
      author_id: luna.id,
      ...content([]),
      body: {
        blocks: [{ id: 'media', type: 'media', attachmentId: attachment.id }, gallery],
      },
    });

    expect(await dbAdapter.getAttachmentById(attachment.id), 'to satisfy', {
      articleId: article.uid,
    });
    expect(await article.update(1, { ...content([]), body: { blocks: [gallery] } }), 'to equal', {
      status: 'updated',
      version: 2,
    });
    expect(await dbAdapter.getAttachmentById(attachment.id), 'to satisfy', {
      articleId: article.uid,
    });
    expect(await article.update(2, content([])), 'to equal', { status: 'updated', version: 3 });
    expect(await dbAdapter.getAttachmentById(attachment.id), 'to satisfy', { articleId: null });
  });

  it('should reject missing, foreign, and occupied attachments without changing the article', async () => {
    const luna = await createUser('luna');
    const mars = await createUser('mars');
    const own = await createAttachment(luna.id, { name: 'own.txt', content: 'own' });
    const foreign = await createAttachment(mars.id, { name: 'foreign.txt', content: 'foreign' });
    const occupied = await createAttachment(luna.id, { name: 'occupied.txt', content: 'occupied' });
    const linked = await createAttachment(luna.id, { name: 'linked.txt', content: 'linked' });
    const post = await createPost(luna, 'Post body');
    await dbAdapter.updateAttachment(occupied.id, { postId: post.id });
    const otherArticle = await dbAdapter.createArticle({
      author_id: luna.id,
      ...content([linked.id]),
    });
    const article = await dbAdapter.createArticle({ author_id: luna.id, ...content([own.id]) });
    const unknownId = '00000000-0000-0000-0000-000000000000' as UUID;

    await Promise.all(
      [unknownId, foreign.id, occupied.id, linked.id].map((id) =>
        expect(article.update(1, content([own.id, id])), 'to be rejected with error satisfying', {
          status: 422,
          message: 'Some article attachments are unavailable',
        }),
      ),
    );

    expect(await dbAdapter.getArticleById(article.uid), 'to satisfy', { version: 1 });
    expect(await article.getRevisions(10, 0), 'to be empty');
    expect(await dbAdapter.getAttachmentById(own.id), 'to satisfy', {
      articleId: article.uid,
    });
    expect(await dbAdapter.getAttachmentById(foreign.id), 'to satisfy', { articleId: null });
    expect(await dbAdapter.getAttachmentById(occupied.id), 'to satisfy', {
      articleId: null,
      postId: post.id,
    });
    expect(await dbAdapter.getAttachmentById(linked.id), 'to satisfy', {
      articleId: otherArticle.uid,
    });
  });

  it('should clear the cached association when the article is deleted', async () => {
    const luna = await createUser('luna');
    const attachment = await createAttachment(luna.id, { name: 'file.txt', content: 'test' });
    const article = await dbAdapter.createArticle({
      author_id: luna.id,
      ...content([attachment.id]),
    });
    expect(await dbAdapter.getAttachmentById(attachment.id), 'to satisfy', {
      articleId: article.uid,
    });

    await article.destroy();

    expect(await dbAdapter.getAttachmentById(attachment.id), 'to satisfy', { articleId: null });
  });
});
