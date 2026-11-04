// SCR-CREATION · Comments tab
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, Trash2 } from "lucide-react";
import { useState } from "react";
import { Act, GoTo } from "../../app/navigation/go-to.tsx";
import { useEngineAction } from "../../app/runtime/engine-query.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { accountPort } from "../../ports/account-port.ts";
import {
  type CommentThread,
  type CreationComment,
  communityPort,
  type ThreadComment,
} from "../../ports/community-port.ts";
import { Avatar } from "../../ui/avatar.tsx";
import { buttonClass } from "../../ui/button-styles.ts";
import { QueryView } from "../../ui/query-view.tsx";
import { EmptyState } from "../../ui/states.tsx";

// The service refuses longer comments; the composer stops at the same length.
const MAX_COMMENT = 1000;

export function useCommentsRefresh(): () => Promise<void> {
  const client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["community", "comments"] }),
      client.invalidateQueries({ queryKey: ["community", "creation"] }),
    ]);
  };
}

export function CreationComments({ creationId }: { creationId: string }) {
  const community = usePort(communityPort);
  const account = usePort(accountPort);
  const thread = useQuery({
    queryKey: ["community", "comments", creationId],
    queryFn: () => community.listComments(creationId),
  });
  const me = useQuery({ queryKey: ["account"], queryFn: account.getAccount });
  const refresh = useCommentsRefresh();
  const post = useEngineAction(community.postComment);
  const remove = useEngineAction(community.deleteComment);
  const signedIn = me.data?.signedIn === true;
  return (
    <QueryView query={thread} errorTitle="Comments could not be loaded">
      {(loaded) => (
        <div className="flex flex-col gap-3.5">
          <CommentComposer
            thread={loaded}
            signedIn={signedIn}
            posting={post.isPending}
            onPost={(text, done) =>
              post.mutate(
                { creationId, text },
                {
                  onSuccess: async () => {
                    done();
                    await refresh();
                  },
                },
              )
            }
          />
          <CommentList
            creationId={creationId}
            comments={loaded.comments}
            signedIn={signedIn}
            onDelete={(commentId) => remove.mutate({ creationId, commentId }, { onSuccess: refresh })}
          />
        </div>
      )}
    </QueryView>
  );
}

type ComposerProps = {
  thread: CommentThread;
  signedIn: boolean;
  posting: boolean;
  onPost: (text: string, done: () => void) => void;
};

export function CommentComposer({ thread, signedIn, posting, onPost }: ComposerProps) {
  const [text, setText] = useState("");
  if (!thread.open) {
    return <p className="m-0 text-ui leading-tight text-fg-tertiary">The author turned comments off.</p>;
  }
  if (!signedIn) {
    return (
      <div className="flex items-center gap-2.5 text-ui">
        <span className="text-fg-secondary">Sign in to the community to join the conversation.</span>
        <GoTo to="MOD-SIGN-IN" cta="Sign in to comment" className={buttonClass("secondary", "ml-auto")}>
          Sign in to comment
        </GoTo>
      </div>
    );
  }
  const empty = text.trim() === "";
  return (
    <div className="flex flex-col gap-2">
      <textarea
        aria-label="Write a comment"
        value={text}
        maxLength={MAX_COMMENT}
        onChange={(event) => setText(event.target.value)}
        placeholder="Write a comment"
        className="h-17.5 resize-none rounded-button bg-control px-3 py-2.5 leading-tight text-fg outline-none placeholder:text-fg-tertiary hover:bg-control-raised focus:bg-control-raised"
      />
      <div className="flex items-center gap-2.5">
        <span className="text-meta text-fg-tertiary">
          {text.length} / {MAX_COMMENT}
        </span>
        <Act
          cta="Post comment"
          disabled={empty || posting}
          title={empty ? "Write something first" : undefined}
          onClick={() => onPost(text, () => setText(""))}
          className={buttonClass("primary", "ml-auto")}
        >
          {posting ? "Posting" : "Post comment"}
        </Act>
      </div>
    </div>
  );
}

type ListProps = {
  creationId: string;
  comments: readonly ThreadComment[];
  signedIn: boolean;
  onDelete: (commentId: string) => void;
};

export function CommentList({ creationId, comments, signedIn, onDelete }: ListProps) {
  if (comments.length === 0) {
    return <EmptyState title="No comments yet" body="Ask how it was trained or share what you made with it." />;
  }
  return (
    <div className="flex flex-col gap-1">
      {comments.map((comment) => (
        <div key={comment.id} className="group flex gap-2.5 rounded-card-sm px-1.5 py-2">
          <Avatar initials={comment.author.initials} tone={comment.author.tone} className="size-7 text-micro" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-ui leading-tight">
            <span className="flex items-center gap-1.5">
              <span className="font-semibold">@{comment.author.handle}</span>
              {comment.time ? <span className="text-meta text-fg-tertiary">{comment.time}</span> : null}
            </span>
            <span className="break-words whitespace-pre-wrap text-fg-secondary">{comment.text}</span>
          </span>
          <span className="flex shrink-0 items-start gap-0.5">
            {/* Whoever may delete a comment (its author, a moderator) removes it instead of reporting it. */}
            {signedIn && !comment.canDelete ? (
              <GoTo
                to="MOD-REPORT"
                params={{ creation: creationId, comment: comment.id, commentBy: comment.author.handle }}
                cta="Report comment"
                aria-label={`Report the comment by @${comment.author.handle}`}
                title="Report comment"
                className={buttonClass("icon", "size-7")}
              >
                <Flag size={13} strokeWidth={1.75} aria-hidden />
              </GoTo>
            ) : null}
            {comment.canDelete ? (
              <Act
                cta="Delete comment"
                aria-label="Delete comment"
                title="Delete comment"
                onClick={() => onDelete(comment.id)}
                className={buttonClass("icon", "size-7")}
              >
                <Trash2 size={13} strokeWidth={1.75} aria-hidden />
              </Act>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  );
}

// The few newest comments under the overview; read only, the Comments tab has the composer and actions.
export function CommentPreview({ comments }: { comments: readonly CreationComment[] }) {
  if (comments.length === 0) {
    return <EmptyState title="No comments yet" />;
  }
  return (
    <div className="flex flex-col gap-2.5">
      {comments.map((comment) => (
        <div key={comment.id} className="flex gap-2.5">
          <Avatar initials={comment.author.initials} tone={comment.author.tone} className="size-7 text-micro" />
          <span className="flex flex-col gap-0.5 text-ui leading-tight">
            <span className="font-semibold">@{comment.author.handle}</span>
            <span className="text-fg-secondary">{comment.text}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
