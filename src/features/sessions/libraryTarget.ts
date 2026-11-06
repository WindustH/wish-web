import type { BlobMention } from '../../core/blobMentions.ts';
import type { ReplyReference } from '../../core/replyReferences.ts';

export type LibraryTarget = { request: number; target: BlobMention | ReplyReference };
