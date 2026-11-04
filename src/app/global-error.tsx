"use client";

import { ErrorScreen } from "@/components/ErrorScreen";
import "./globals.css";

/** Shown if even the app's frame fails to load. */
export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <ErrorScreen {...props} />
      </body>
    </html>
  );
}
