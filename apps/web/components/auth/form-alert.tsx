import { AlertCircle, CheckCircle2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

/** A form-level error or success message. */
export function FormAlert({
  message,
  tone = "error",
}: {
  message: string | null;
  tone?: "error" | "success";
}) {
  if (!message) return null;
  const Icon = tone === "error" ? AlertCircle : CheckCircle2;
  return (
    <Alert variant={tone === "error" ? "destructive" : "default"}>
      <Icon aria-hidden />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
