import { Comment, Group, Post, User } from '../../../app/models';
import { UUID } from '../../../app/support/types';

export async function createPost(
  author: User,
  body: string,
  destinations: (User | Group)[] = [author],
): Promise<Post> {
  const timelineIds = (await Promise.all(
    destinations.map((d) => d.getPostsTimelineId()),
  )) as UUID[];
  const post = new Post({ userId: author.id, body, timelineIds });
  await post.create();
  return post;
}

export async function createComment(author: User, post: Post, body: string): Promise<Comment> {
  const comment = author.newComment({ body, postId: post.id });
  await comment.create();
  return comment;
}
