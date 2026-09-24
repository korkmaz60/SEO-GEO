import { z } from "zod";

/** Envelope and task `status_code` for success. */
export const STATUS_OK = 20000;
/** Task `status_code` returned by `task_post` endpoints: accepted, results come later. */
export const STATUS_TASK_CREATED = 20100;
/** DataForSEO codes from this value upward are server-side errors and worth retrying. */
export const FIRST_SERVER_ERROR_CODE = 50000;

export const TaskEnvelopeSchema = z.looseObject({
  id: z.string(),
  status_code: z.number().int(),
  status_message: z.string(),
  cost: z.number().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  result: z.array(z.unknown()).nullable().optional(),
});
export type TaskEnvelope = z.infer<typeof TaskEnvelopeSchema>;

export const ResponseEnvelopeSchema = z.looseObject({
  version: z.string().optional(),
  status_code: z.number().int(),
  status_message: z.string(),
  cost: z.number().optional(),
  tasks: z.array(TaskEnvelopeSchema).nullable().optional(),
});
export type ResponseEnvelope = z.infer<typeof ResponseEnvelopeSchema>;

/** A body that at least carries a DataForSEO status code and message. */
export const StatusOnlySchema = z.looseObject({
  status_code: z.number().int(),
  status_message: z.string(),
});
