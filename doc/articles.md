# Articles

Articles are long-form content owned by users. An article may exist as an unpublished draft or be published through one post.

## Data model

An article contains:

- `id` and `shortId`;
- `authorId`;
- nullable `postId`;
- `version` for optimistic updates;
- derived `title`, user-provided `digest`, and Markdown `body`;
- `tags`;
- `createdAt` and `updatedAt`.

The server stores `body` unchanged. It parses Markdown only to derive the title and find user mentions. The title is the text of the first level-one heading, or the first 255 characters of the body when there is no such heading.

Attachments are not associated with articles or extracted from Markdown.

An article revision is a snapshot of the previous `title` and `body`, together with its version and creation time. A revision is created only when `body` changes. Other content changes may increment the article version without creating a revision. Tags are not revisioned.

## Access and publication

An unpublished article has no `postId` and is visible only to its author. A published article has a linked post and follows that post's privacy and ban rules.

Publishing an article notifies mentioned users who can see its post. Later updates notify newly mentioned users. Each user receives at most one mention notification per article, including after republishing.

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

Requires authentication. The request body contains three fields:

```json
{
  "digest": "Short description",
  "body": "# Article title\n\nArticle text",
  "tags": ["example"]
}
```

The response contains the full `article` and related `users`, `posts`, and `attachments` sidecars. The `attachments` sidecar contains attachments from a linked post, if any.

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

List items contain all serialized article fields except `body`.

### Get an article

`GET /vN/articles/:articleId`

Returns the full article and related sidecars. The author can read a draft; other viewers can read the article only when they can see its linked post.

### Update an article

`PUT /vN/articles/:articleId?expectedVersion=VERSION`

Requires the author. The request body has the same required fields as article creation. `expectedVersion` is a required positive integer. A stale version returns `409 Article version is mismatched` without changing the article.

Changing `digest` or `body` increments the version. Changing `body` also stores its previous value and derived title as a revision. A digest-only or tags-only change does not create a revision.

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

Requires the author. `revisionId` must be a UUID belonging to the requested article. The response contains the stored revision ID, article ID, version, creation time, title, and body.
