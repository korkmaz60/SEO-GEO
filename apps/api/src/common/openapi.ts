import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from "@nestjs/swagger";
import { z } from "zod";

import type { AppConfig } from "../config/env.js";

type SchemaObject = NonNullable<NonNullable<OpenAPIObject["components"]>["schemas"]>[string];

/** Converts a Zod schema from `@seo-geo/contracts` into an OpenAPI 3.0 schema object. */
export function toOpenApiSchema(schema: z.ZodType): SchemaObject {
  const jsonSchema = z.toJSONSchema(schema, { target: "openapi-3.0", unrepresentable: "any" });
  const { $schema: _ignored, ...rest } = jsonSchema as Record<string, unknown>;
  return rest as SchemaObject;
}

export const OPENAPI_JSON_PATH = "api/v1/openapi.json";
export const SWAGGER_UI_PATH = "api/docs";

export function createOpenApiDocument(app: INestApplication, config: AppConfig): OpenAPIObject {
  const options = new DocumentBuilder()
    .setTitle("SEO-GEO API")
    .setDescription("REST API for SEO and AI search visibility (GEO/AEO).")
    .setVersion(config.version)
    .build();
  return SwaggerModule.createDocument(app, options);
}

export function setupOpenApi(app: INestApplication, config: AppConfig): void {
  SwaggerModule.setup(SWAGGER_UI_PATH, app, () => createOpenApiDocument(app, config), {
    jsonDocumentUrl: OPENAPI_JSON_PATH,
  });
}
