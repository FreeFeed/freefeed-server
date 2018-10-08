/* eslint-env node, mocha */
/* global $pg_database */
import expect from 'unexpected'

import cleanDB from '../dbCleaner'
import { load as configLoader } from '../../config/config';
import { createUserAsync, performRequest, updateUserAsync, createAndReturnPost, createMockAttachmentAsync, updatePostAsync } from './functional_test_helper';

const config = configLoader();

describe('TimelinesAsRSS', () => {
  beforeEach(() => cleanDB($pg_database));

  describe('User Luna', () => {
    let luna;
    beforeEach(async () => luna = await createUserAsync('luna', 'pw'));

    it('should return a basic empty RSS for Luna', async () => {
      const resp = await fetchUserTimelineAsRSS(luna);
      expect(resp, 'to be', [
        `<?xml version="1.0"?>`,
        `<rss version="2.0">`,
        `  <channel>`,
        `    <title>${luna.username} @ FreeFeed.net</title>`,
        `    <link>${config.host}/${luna.username}</link>`,
        `    <description/>`,
        `  </channel>`,
        `</rss>`
      ].join('\n'));
    });

    it('should return RSS with user description', async () => {
      await updateUserAsync(luna, { description: 'I am Luna!' });
      const resp = await fetchUserTimelineAsRSS(luna);
      expect(resp, 'to be', [
        `<?xml version="1.0"?>`,
        `<rss version="2.0">`,
        `  <channel>`,
        `    <title>${luna.username} @ FreeFeed.net</title>`,
        `    <link>${config.host}/${luna.username}</link>`,
        `    <description>I am Luna!</description>`,
        `  </channel>`,
        `</rss>`
      ].join('\n'));
    });

    it('should return RSS with a post', async () => {
      const post = await createAndReturnPost(luna, `Tiger, @tiger, burning bright
        In the forests of the night,
        What immortal.com hand or eye
        Dare frame thy fearful #symmetry?`);
      const resp = await fetchUserTimelineAsRSS(luna);
      expect(resp, 'to be', [
        `<?xml version="1.0"?>`,
        `<rss version="2.0">`,
        `  <channel>`,
        `    <title>${luna.username} @ FreeFeed.net</title>`,
        `    <link>${config.host}/${luna.username}</link>`,
        `    <description/>`,
        `    <item>`,
        `      <guid>freefeed:post:${post.id}</guid>`,
        `      <pubDate>${new Date(+post.createdAt).toGMTString()}</pubDate>`,
        `      <link>${config.host}/${luna.username}/${post.id}</link>`,
        `      <title>Tiger, @tiger, burning bright</title>`,
        `      <description>&lt;p&gt;Tiger, &lt;a href="http://localhost:31337/tiger"&gt;@tiger&lt;/a&gt;, burning bright&lt;br /&gt;`,
        `In the forests of the night,&lt;br /&gt;`,
        `What &lt;a href="http://immortal.com/"&gt;immortal.com&lt;/a&gt; hand or eye&lt;br /&gt;`,
        `Dare frame thy fearful &lt;a href="http://localhost:31337/search?qs=%23symmetry"&gt;#symmetry&lt;/a&gt;?&lt;/p&gt;</description>`,
        `    </item>`,
        `  </channel>`,
        `</rss>`
      ].join('\n'));
    });

    it('should return RSS with a post with attachments', async () => {
      const att1 = await createMockAttachmentAsync(luna);
      const att2 = await createMockAttachmentAsync(luna);
      const post = await createAndReturnPost(luna, `Tiger, tiger, burning bright\nIn the forests of the night.`);
      luna.post = post;
      await updatePostAsync(luna, {
        body:        post.body,
        attachments: [att1.id, att2.id],
      });
      const resp = await fetchUserTimelineAsRSS(luna);
      expect(resp, 'to be', [
        `<?xml version="1.0"?>`,
        `<rss version="2.0">`,
        `  <channel>`,
        `    <title>${luna.username} @ FreeFeed.net</title>`,
        `    <link>${config.host}/${luna.username}</link>`,
        `    <description/>`,
        `    <item>`,
        `      <guid>freefeed:post:${post.id}</guid>`,
        `      <pubDate>${new Date(+post.createdAt).toGMTString()}</pubDate>`,
        `      <link>${config.host}/${luna.username}/${post.id}</link>`,
        `      <title>Tiger, tiger, burning bright</title>`,
        `      <description>&lt;p&gt;Tiger, tiger, burning bright&lt;br /&gt;`,
        `In the forests of the night.&lt;/p&gt;</description>`,
        `      <enclosure url="${config.host}/attachments/${att1.id}" length="${att1.fileSize}" type="image/jpeg"/>`,
        `      <enclosure url="${config.host}/attachments/${att2.id}" length="${att1.fileSize}" type="image/jpeg"/>`,
        `    </item>`,
        `  </channel>`,
        `</rss>`
      ].join('\n'));
    });
  });
});

const fetchUserTimelineAsRSS = async (userContext, viewerContext = null) => {
  const headers = {};
  if (viewerContext) {
    headers['X-Authentication-Token'] = viewerContext.authToken;
  }
  const response = await performRequest(`/v2/timelines-rss/${userContext.username}`, { headers });
  if (response.status !== 200) {
    const { err } = await response.json();
    expect.fail('HTTP error (code {0}): {1}', response.status, err);
  }
  expect(response.headers.get('Content-Type'), 'to be', 'application/xml');
  return await response.text();
};
