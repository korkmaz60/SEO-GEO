import type { FormEvent, ReactNode } from "react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A titled settings card. With `onSubmit` the content and footer become one form, so the
 * footer's submit button saves the fields above it.
 */
export function SettingsSection({
  id,
  title,
  description,
  action,
  children,
  footer,
  onSubmit,
  tone = "default",
  className,
}: {
  id?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  tone?: "default" | "danger";
  className?: string;
}) {
  const body = (
    <>
      {children && <CardContent>{children}</CardContent>}
      {footer && <CardFooter className="justify-end gap-2">{footer}</CardFooter>}
    </>
  );
  return (
    <Card
      id={id}
      className={cn("scroll-mt-20", tone === "danger" && "ring-destructive/40", className)}
    >
      <CardHeader>
        <CardTitle className={cn(tone === "danger" && "text-destructive")}>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      {onSubmit ? (
        <form onSubmit={onSubmit} className="contents">
          {body}
        </form>
      ) : (
        body
      )}
    </Card>
  );
}
