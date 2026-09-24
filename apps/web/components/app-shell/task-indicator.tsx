"use client";

import { TaskSchema, type Task } from "@seo-geo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { apiGet, apiSend, errorMessage } from "@/lib/api";
import { useCan, useWorkspace } from "@/lib/workspace-context";

const TaskListSchema = z.object({ data: z.array(TaskSchema) });

export function activeTasksQueryKey(workspaceId: string) {
  return ["tasks", workspaceId, "active"] as const;
}

/**
 * Queued and running background work. Hidden while nothing runs; polls faster while
 * something does.
 */
export function TaskIndicator() {
  const t = useTranslations("shell.tasks");
  const { workspace } = useWorkspace();
  const canCancel = useCan("member");
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: activeTasksQueryKey(workspace.id),
    queryFn: ({ signal }) =>
      apiGet(`/workspaces/${workspace.id}/tasks?status=queued,running&limit=20`, TaskListSchema, {
        signal,
      }),
    refetchInterval: (query) => ((query.state.data?.data.length ?? 0) > 0 ? 3_000 : 30_000),
  });
  const cancel = useMutation({
    mutationFn: (task: Task) =>
      apiSend("POST", `/workspaces/${workspace.id}/tasks/${task.id}/cancel`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: activeTasksQueryKey(workspace.id) }),
    onError: (error) => toast.error(errorMessage(error, t("cancelFailed"))),
  });

  const tasks = data?.data ?? [];
  if (tasks.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" aria-label={t("running", { count: tasks.length })} />
        }
      >
        <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />
        <span className="tabular-nums">{tasks.length}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>{t("title")}</PopoverTitle>
          <PopoverDescription>{t("description")}</PopoverDescription>
        </PopoverHeader>
        <ul className="flex flex-col gap-3">
          {tasks.map((task) => (
            <li key={task.id} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                {/* Task types get localized labels with the modules that create them (M2). */}
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{task.type}</span>
                <span className="text-xs text-muted-foreground">{t(`status.${task.status}`)}</span>
                {canCancel && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("cancel")}
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate(task)}
                  >
                    <X />
                  </Button>
                )}
              </div>
              <Progress
                value={task.status === "queued" ? null : task.progress}
                aria-label={t("progress")}
              />
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
