import { readNdjson } from "./ndjson";

export type ImageResult = { id: string; url: string; label: string; usedPackPhoto?: boolean; warning?: string };

/** Asks the server for an image and reports each stage it goes through (what is happening right now). */
export async function requestImageWithStages(body: Record<string, unknown>, onStage: (text: string) => void): Promise<ImageResult> {
  const res = await fetch("/api/image", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, stream: true }) });
  return readNdjson<ImageResult>(res, () => {}, onStage);
}
