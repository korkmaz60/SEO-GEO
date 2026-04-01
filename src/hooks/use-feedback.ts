"use client";

import { useState, useCallback } from "react";

export type FeedbackType = "success" | "error" | "info";

interface Feedback {
  type: FeedbackType;
  message: string;
}

export function useFeedback(autoHideMs = 5000) {
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const show = useCallback(
    (type: FeedbackType, message: string) => {
      setFeedback({ type, message });
      if (autoHideMs > 0) {
        setTimeout(() => setFeedback(null), autoHideMs);
      }
    },
    [autoHideMs]
  );

  const clear = useCallback(() => setFeedback(null), []);

  return { feedback, show, clear };
}
