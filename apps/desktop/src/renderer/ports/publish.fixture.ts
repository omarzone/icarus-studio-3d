import type { CommunityPage, PublishPort, PublishReadiness, PublishReview } from "./publish-port.ts";

// Sample data from the design, used only by the prototype, the design gallery and tests.
const PAGE: CommunityPage = {
  title: "Park Pilot",
  description: "A small car that learns to park itself with 8 distance sensors. Trained in 16 lots at once.",
  permissions: [
    { id: "remix", label: "Remix", on: true },
    { id: "download-brain", label: "Download brain", on: true },
    { id: "retrain", label: "Retrain", on: true },
    { id: "commercial", label: "Commercial use", on: false },
  ],
  included: [
    "World · parking lot with randomized cars",
    "Body · car with 8 sensors",
    "Brain · run 3, parks 71%",
    "Training history and timelapse",
  ],
  preview: { byline: "by Omar · car · 2M steps", votes: 0 },
};

const READINESS: PublishReadiness = {
  author: { name: "Omar", handle: "omar", initials: "O", tone: 0, signature: "Made with Icarus" },
  reach: "People can remix it and download its brain.",
  checks: [
    { text: "No personal data in the files", ok: true },
    { text: "Brain, world and body files only, no code", ok: true },
    { text: "Title and description written", ok: true },
  ],
  guidelinesAccepted: true,
};

// The sample project was just sent, as the design shows right after publishing.
const REVIEW: PublishReview = { status: "review", creationId: "park-pilot" };

// In-memory publishing that behaves: edits change the page, publishing moves the project to review.
export function createPublishFixture(): PublishPort {
  let page = PAGE;
  let readiness = READINESS;
  let review = REVIEW;
  const titleCheck = (next: CommunityPage) => next.title.trim() !== "" && next.description.trim() !== "";
  return {
    getCommunityPage: async () => page,
    updateCommunityPage: async ({ title, description, permission }) => {
      page = {
        ...page,
        title: title ?? page.title,
        description: description ?? page.description,
        permissions: page.permissions.map((item) =>
          permission && item.id === permission.id ? { ...item, on: permission.on } : item,
        ),
      };
      readiness = {
        ...readiness,
        checks: readiness.checks.map((check, index) => (index === 2 ? { ...check, ok: titleCheck(page) } : check)),
      };
      return page;
    },
    saveDraft: async () => undefined,
    getReadiness: async () => readiness,
    acceptGuidelines: async ({ accepted }) => {
      readiness = { ...readiness, guidelinesAccepted: accepted };
      return readiness;
    },
    publish: async () => {
      review = { status: "review", creationId: "park-pilot" };
      return review;
    },
    getReview: async () => review,
  };
}
