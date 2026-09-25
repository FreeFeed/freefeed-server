# Articles

Articles are long-form content owned by users. An article may exist as an unpublished draft or be published through one post.

## Data model

An article contains:

- `id` and `shortId`;
- `authorId`;
- nullable `postId`;
- `version` for optimistic updates;
- `title`, `digest`, and structured `body`;
- `tags`;
- `createdAt` and `updatedAt`.

Full article responses also contain `attachmentIds`, derived from the current body. List and feed responses omit `body` and `attachmentIds`.

Article bodies contain blocks with unique string IDs. Supported block types are:

- `text`: text in `content`;
- `heading`: text in `content` and a `level` from 2 to 6;
- `list`: strings in `items`;
- `code`: `content` and an optional `language`;
- `media`: one `attachmentId` with optional `alt` and `caption`;
- `gallery`: an array of items containing `attachmentId` and optional `alt` and `caption`.

Media attachments can represent images, video, audio, or general files. There is no separate cover attachment. Attachment associations follow the current body; revisions retain attachment IDs only as part of their stored body.

An article revision is a snapshot of the previous `title`, `digest`, and `body`, together with its version and creation time. Tags are not revisioned.

## Access and publication

An unpublished article has no `postId` and is visible only to its author. A published article has a linked post and follows that post's privacy and ban rules.

An article can be linked only while creating a post:

```json
{
  "post": {
    "body": "Post body",
    "articleId": "ARTICLE_UUID"
  },
  "meta": {
    "feeds": ["username"]
  }
}
```

The post and article must have the same author. An article cannot be linked to two active posts. It may be reassigned when its previous post is being deleted. Post updates reject `articleId`; unlinking uses the article endpoint.

Serialized posts contain `articleId`. Feed responses collect referenced article summaries in the top-level `articles` array.

## API

Routes below use `/vN` to denote a supported API version. `articleId` accepts either an article UUID or its short ID unless stated otherwise.

### Create an article

`POST /vN/articles`

Requires authentication. The request body contains all four fields:

```json
{
  "title": "Article title",
  "digest": "Short description",
  "body": {
    "blocks": [
      {
        "id": "intro",
        "type": "text",
        "content": "Article text"
      }
    ]
  },
  "tags": ["example"]
}
```

Referenced attachments must be available to the author. The response contains the full `article` and related `users`, `posts`, and `attachments` sidecars.

### List articles

`GET /vN/articles`

Query parameters:

- `author`: an existing user's username; groups are rejected;
- `published`: `true` for published articles or `false` for drafts; defaults to `false`;
- `limit` and `offset`: pagination parameters; `limit` is capped at 100.

Articles are ordered by creation time, newest first. Draft listings contain only the requesting author's articles. Published listings apply linked-post visibility before pagination.

The response is:

```json
{
  "articles": [],
  "isLastPage": true
}
```

List items contain all serialized article fields except `body` and `attachmentIds`.

### Get an article

`GET /vN/articles/:articleId`

Returns the full article and related sidecars. The author can read a draft; other viewers can read the article only when they can see its linked post.

### Update an article

`PUT /vN/articles/:articleId?expectedVersion=VERSION`

Requires the author. The request body has the same required fields as article creation. `expectedVersion` is a required positive integer. A stale version returns `409 Article version is mismatched` without changing the article.

Changing `title`, `digest`, or `body` increments the version and stores the previous content as a revision. A tags-only change does not create a revision.

### Delete and restore an article

`DELETE /vN/articles/:articleId`

Requires the author. Deletion is reversible and returns an undo entry with subject `articleDelete` and a token.

Restore it through the shared undo endpoint:

```http
POST /vN/undo/articleDelete
```

```json
{
  "token": "UNDO_TOKEN"
}
```

### Detach an article from its post

`DELETE /vN/articles/:articleId/post`

Requires the author. The response contains the full article with `postId: null`. The former post is retained and its serialized `articleId` becomes `null`.

### List revisions

`GET /vN/articles/:articleId/revisions`

Requires the author. Supports `limit` and `offset`, with `limit` capped at 100. The response contains revision `id` and `createdAt` values plus `isLastPage`.

### Get a revision

`GET /vN/articles/:articleId/revisions/:revisionId`

Requires the author. `revisionId` must be a UUID belonging to the requested article. The response contains the stored revision data and attachments referenced by its body.
