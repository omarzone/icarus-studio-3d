import { definePort } from "../app/runtime/port.tsx";
import type { AvatarTone } from "../ui/avatar.tsx";
import { createPublishFixture } from "./publish.fixture.ts";
import { createCommunityPublish } from "./publish-community.ts";

// A project's community page before it is published, the checks run on it and its review.
export type PublishPermissionId = "remix" | "download-brain" | "retrain" | "commercial";

export type CommunityPage = {
  title: string;
  description: string;
  permissions: readonly { id: PublishPermissionId; label: string; on: boolean }[];
  // What the bundle carries ("World · parking lot with randomized cars").
  included: readonly string[];
  preview: { byline: string; votes: number };
};

export type PublishCheck = { text: string; ok: boolean };

export type PublishReadiness = {
  author: { name: string; handle: string; initials: string; tone: AvatarTone; signature: string | null };
  // What people will be able to do with it, as one sentence.
  reach: string;
  checks: readonly PublishCheck[];
  guidelinesAccepted: boolean;
};

export type ReviewStatus = "draft" | "review" | "public";

export type PublishReview = { status: ReviewStatus; creationId: string | null };

export type PublishPort = {
  getCommunityPage: (project: string) => Promise<CommunityPage>;
  updateCommunityPage: (input: {
    project: string;
    title?: string;
    description?: string;
    permission?: { id: PublishPermissionId; on: boolean };
  }) => Promise<CommunityPage>;
  saveDraft: (project: string) => Promise<void>;
  getReadiness: (project: string) => Promise<PublishReadiness>;
  acceptGuidelines: (input: { project: string; accepted: boolean }) => Promise<PublishReadiness>;
  publish: (project: string) => Promise<PublishReview>;
  getReview: (project: string) => Promise<PublishReview>;
};

export const publishPort = definePort<PublishPort>({
  app: createCommunityPublish(),
  prototype: createPublishFixture,
});
