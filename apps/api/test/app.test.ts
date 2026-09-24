import "reflect-metadata";

import { Body, Controller, Get, Module, Post } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import {
  HealthResponseSchema,
  PROBLEM_CONTENT_TYPE,
  ProblemDetailsSchema,
} from "@seo-geo/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { Public } from "../src/auth/decorators.js";
import { ZodValidationPipe } from "../src/common/zod-validation.pipe.js";
import { testConfig } from "./support/config.js";

const EchoSchema = z.strictObject({
  name: z.string().min(2),
  tags: z.array(z.string()).max(3).default([]),
});

@Public()
@Controller("test")
class TestController {
  @Post("echo")
  echo(@Body(new ZodValidationPipe(EchoSchema)) body: z.output<typeof EchoSchema>) {
    return body;
  }

  @Get("boom")
  boom(): never {
    throw new Error("database password is hunter2");
  }
}

@Module({ controllers: [TestController] })
class TestModule {}

describe("api application", () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const config = testConfig({ APP_VERSION: "9.9.9" });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(config), TestModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
      bodyParser: false,
    });
    configureApp(app, config);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("serves the health endpoint under /api/v1", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/health").expect(200);

    const body = HealthResponseSchema.parse(response.body);
    expect(body).toMatchObject({ status: "ok", version: "9.9.9", mode: "api" });
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("reuses a safe incoming request ID and replaces an unsafe one", async () => {
    const safe = await request(app.getHttpServer())
      .get("/api/v1/health")
      .set("X-Request-Id", "edge-abc.123");
    expect(safe.headers["x-request-id"]).toBe("edge-abc.123");

    const unsafe = await request(app.getHttpServer())
      .get("/api/v1/health")
      .set("X-Request-Id", "bad id\twith spaces");
    expect(unsafe.headers["x-request-id"]).not.toBe("bad id\twith spaces");
  });

  it("returns problem+json for unknown routes", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/nope?token=secret")
      .expect(404);

    expect(response.headers["content-type"]).toContain(PROBLEM_CONTENT_TYPE);
    const problem = ProblemDetailsSchema.parse(response.body);
    expect(problem).toMatchObject({
      status: 404,
      code: "not_found",
      instance: "/api/v1/nope",
      detail: "No route for GET /api/v1/nope",
    });
    expect(JSON.stringify(problem)).not.toContain("secret");
    expect(problem.requestId).toBe(response.headers["x-request-id"]);
  });

  it("validates bodies with Zod and lists field errors", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/test/echo")
      .send({ name: "x", tags: ["a", "b", "c", "d"] })
      .expect(400);

    const problem = ProblemDetailsSchema.parse(response.body);
    expect(problem.code).toBe("validation_failed");
    expect(problem.errors?.map((e) => e.path).sort()).toEqual(["name", "tags"]);
  });

  it("passes the parsed body to the handler", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/test/echo")
      .send({ name: "SEO-GEO" })
      .expect(201);

    expect(response.body).toEqual({ name: "SEO-GEO", tags: [] });
  });

  it("rejects unknown fields", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/test/echo")
      .send({ name: "SEO-GEO", isAdmin: true })
      .expect(400);

    expect(ProblemDetailsSchema.parse(response.body).code).toBe("validation_failed");
  });

  it("hides internal error details", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/test/boom").expect(500);

    const problem = ProblemDetailsSchema.parse(response.body);
    expect(problem.code).toBe("internal_error");
    expect(JSON.stringify(problem)).not.toContain("hunter2");
  });

  it("requires a session for everything that is not public", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/me").expect(401);

    expect(response.headers["content-type"]).toContain(PROBLEM_CONTENT_TYPE);
    expect(ProblemDetailsSchema.parse(response.body)).toMatchObject({
      status: 401,
      code: "unauthorized",
    });
  });

  it("serves Better Auth under /api/auth", async () => {
    const response = await request(app.getHttpServer()).get("/api/auth/ok").expect(200);

    expect(response.body).toEqual({ ok: true });
  });

  it("publishes the OpenAPI document", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/openapi.json").expect(200);

    expect(response.body.openapi).toMatch(/^3\./);
    expect(response.body.info).toMatchObject({ title: "SEO-GEO API", version: "9.9.9" });
    expect(Object.keys(response.body.paths)).toContain("/api/v1/health");
  });
});
