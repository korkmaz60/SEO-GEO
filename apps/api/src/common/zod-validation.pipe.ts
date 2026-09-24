import type { PipeTransform } from "@nestjs/common";
import type { z } from "zod";

import { ProblemException } from "./problem.exception.js";

/**
 * Validates and transforms a request part with a Zod schema from `@seo-geo/contracts`:
 * `@Body(new ZodValidationPipe(CreateProjectSchema)) body: CreateProject`.
 */
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<TSchema>
> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);
    if (!result.success) throw ProblemException.validation(result.error);
    return result.data;
  }
}
