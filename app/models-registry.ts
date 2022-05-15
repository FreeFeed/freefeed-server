import type Knex from 'knex';

import { DbAdapter } from './support/DbAdapter';
import PubSub from './pubsub';
import { addModel as attachmentModel } from './models/attachment';
import { addModel as commentModel } from './models/comment';
import { addModel as groupModel } from './models/group';
import { addModel as postModel } from './models/post';
import { addModel as timelineModel } from './models/timeline';
import { addModel as userModel } from './models/user';
import { addServerInfoModel } from './models/server-info';
import { addJobModel, addJobManagerModel } from './models/job';
import {
  type User,
  type Group,
  type Post,
  type Timeline,
  type Attachment,
  type Comment,
  type ServerInfo,
  type Job,
  type JobManager,
} from './models';
import { EventService } from './support/EventService';
import { PubSubAdapter } from './support/PubSubAdapter';

export class ModelsRegistry {
  readonly dbAdapter: DbAdapter;
  readonly pubSub: PubSub;
  readonly eventService: EventService;

  readonly User: typeof User;
  readonly Group: typeof Group;
  readonly Post: typeof Post;
  readonly Timeline: typeof Timeline;
  readonly Attachment: typeof Attachment;
  readonly Comment: typeof Comment;
  readonly ServerInfo: typeof ServerInfo;
  readonly Job: typeof Job;
  readonly JobManager: typeof JobManager;

  constructor(database: Knex, pubsubAdapter: PubSubAdapter) {
    this.dbAdapter = new DbAdapter(database, this);
    this.pubSub = new PubSub(pubsubAdapter, this);

    this.User = userModel(this);
    this.Group = groupModel(this, this.dbAdapter, this.pubSub);
    this.Post = postModel(this);
    this.Timeline = timelineModel(this.dbAdapter);
    this.Attachment = attachmentModel(this.dbAdapter);
    this.Comment = commentModel(this);
    this.ServerInfo = addServerInfoModel(this.dbAdapter);
    this.Job = addJobModel(this.dbAdapter);
    this.JobManager = addJobManagerModel(this.dbAdapter);

    this.eventService = new EventService(this);
  }
}
