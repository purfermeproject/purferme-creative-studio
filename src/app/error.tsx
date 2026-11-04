"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

export default function PageError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorScreen {...props} />;
}
