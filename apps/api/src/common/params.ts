import { Param, type PipeTransform } from "@nestjs/common";
import { z } from "zod";

import { ProblemException } from "./problem.exception.js";

const Uuid = z.uuid();

class UuidOrNotFoundPipe implements PipeTransform<unknown, string> {
  constructor(private readonly resource: string) {}

  transform(value: unknown): string {
    const parsed = Uuid.safeParse(value);
    if (!parsed.success) throw ProblemException.notFound(`${this.resource} not found.`);
    return parsed.data;
  }
}

/** A UUID route parameter. Anything else is a 404, exactly like an unknown ID. */
export const IdParam = (name: string, resource: string) =>
  Param(name, new UuidOrNotFoundPipe(resource));
