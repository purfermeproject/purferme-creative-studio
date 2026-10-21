/** Reads the generate route's newline-delimited JSON stream: progress events, then one "done" (or "error"). */
export async function readNdjson<T>(res: Response, onProgress: (chars: number, items: number) => void, onStage?: (text: string) => void): Promise<T> {
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `The server returned ${res.status}. Try again.`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.type === "progress") onProgress(msg.chars, msg.concepts);
      if (msg.type === "stage") onStage?.(msg.text);
      if (msg.type === "error") throw new Error(msg.message);
      if (msg.type === "done") return msg as T;
    }
  }
  throw new Error("The connection closed before the result arrived. Try again.");
}
