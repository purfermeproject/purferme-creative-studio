import type { CreativeSnapshot } from "@/db/schema";
import type { ScanResult } from "@/lib/compliance";
import type { MadeImage } from "@/components/ImageMaker";
import type { Proposal } from "@/lib/schemas";
import type { CreativeStatus, Deliverable, Objective, Platform, ProductStatus } from "@/lib/types";

export type ProductCard = {
  id: string;
  slug: string;
  name: string;
  priceText: string;
  status: ProductStatus;
  statusReason: string;
  packImageUrl: string | null;
  greenClaims: string[];
  amberClaims: string[];
  redClaims: string[];
  claimEvidence: { claim: string; evidence: string; source?: string }[];
  messagingPriorities: string[];
  evidenceCount: number;
  photos: { id: string; url: string; label: string }[];
};

export type CompetitorOption = { id: string; brand: string; product: string; channel: string };

export type PackUpload = { mediaType: "image/png" | "image/jpeg" | "image/webp"; base64: string; name: string };

export type Brief = {
  productId: string;
  objective: Objective;
  persona: string;
  platform: Platform;
  creativeType: string;
  placement: string;
  deliverable: Deliverable;
  angle: string;
  language: string;
  extra: string;
  inspiration: string;
  pack: PackUpload | null;
  /** Analysed competitor ad to stand apart from ("" = none). */
  competitorId: string;
  /** Make the first image as soon as an idea is developed. */
  autoImage: boolean;
  /** Amazon/Flipkart: use the latest "what's working" research. */
  usePlaybook: boolean;
  /** Use everything researched about this product's competitors. */
  useLandscape: boolean;
};

/** What the brief shows about a product's competitor research. */
export type LandscapeSummary = { count: number; brands: string[]; hooks: string[]; open: string[] };
/** Competitor ideas opened from the Competitors page ("Develop this idea"). */
export type InitialIdeas = { brand: string; proposals: ScoredProposal[] };

export type PlaybookOption = { platform: "amazon" | "flipkart"; productId: string | null; category: string; date: string };

export type ScoredProposal = Proposal & { scan: ScanResult };

/** A creative open in the workspace. Content lives in `snapshot`; the rest is metadata. */
export type OpenCreative = {
  id: string;
  platform: Platform;
  productId: string | null;
  productName: string;
  creativeType: string;
  placement: string;
  objective: Objective | "";
  deliverable: Deliverable;
  status: CreativeStatus;
  revision: number;
  snapshot: CreativeSnapshot;
  images: MadeImage[];
  qaChecked: number[];
  claimsReviewedBy: string;
  approvedBy: string;
  createdBy: string;
  createdAt: string;
  mock: boolean;
  model: string;
};

export type RecentCreative = { id: string; title: string; status: CreativeStatus; platform: Platform; productName: string; updatedAt: string };
