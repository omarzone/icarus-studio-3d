// MOD-PUBLISHED
import { useQuery } from "@tanstack/react-query";
import { Check, Clock } from "lucide-react";
import { CloseOverlay, GoTo } from "../../app/navigation/go-to.tsx";
import { useNavigation } from "../../app/navigation/navigation-store.tsx";
import { usePort } from "../../app/runtime/port.tsx";
import { type PublishReview, publishPort } from "../../ports/publish-port.ts";
import { Dialog } from "../../ui/dialog.tsx";
import { QueryView } from "../../ui/query-view.tsx";
import { dialogButton } from "./dialog-button.tsx";
import { useBuildProject } from "./use-build-project.ts";

export function PublishedDialog() {
  const project = useBuildProject();
  const port = usePort(publishPort);
  const review = useQuery({ queryKey: ["publish", "review", project.id], queryFn: () => port.getReview(project.id) });
  return (
    <Dialog title="" width="w-121.5">
      <QueryView query={review}>{(data) => <ReviewBody review={data} projectName={project.name} />}</QueryView>
    </Dialog>
  );
}

function ReviewBody({ review, projectName }: { review: PublishReview; projectName: string }) {
  const params = useNavigation((state) => state.params);
  const sent = review.status !== "draft";
  return (
    <>
      <div className="-mt-0.75 flex flex-col items-center gap-2.5 py-2.5 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-ok-tint text-ok">
          {sent ? (
            <Check size={22} strokeWidth={2.4} aria-hidden />
          ) : (
            <Clock size={22} strokeWidth={1.75} aria-hidden />
          )}
        </span>
        <h3 className="text-title-3 leading-5.5">{TITLES[review.status]}</h3>
        <p className="leading-normal text-fg-secondary">{detail(review, projectName)}</p>
      </div>
      <div className="flex justify-center gap-2">
        {review.creationId ? (
          <GoTo
            to="SCR-CREATION"
            cta="View its page"
            params={{ ...params, creation: review.creationId }}
            className={dialogButton("primary")}
          >
            View its page
          </GoTo>
        ) : null}
        <CloseOverlay cta="Back to Build" className={dialogButton("secondary")}>
          Back to Build
        </CloseOverlay>
      </div>
    </>
  );
}

const TITLES: Readonly<Record<PublishReview["status"], string>> = {
  draft: "Not sent yet",
  review: "Sent for review",
  public: "It is public",
};

function detail(review: PublishReview, projectName: string): string {
  switch (review.status) {
    case "draft":
      return `${projectName} is still a draft. Publish it from Build when it is ready.`;
    case "review":
      return `It usually takes a few minutes. We will let you know when ${projectName} is public.`;
    case "public":
      return `${projectName} is public in the community now.`;
  }
}
