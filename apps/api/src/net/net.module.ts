import { Global, Module } from "@nestjs/common";

import { SafeFetcherService } from "./safe-fetcher.service.js";

@Global()
@Module({ providers: [SafeFetcherService], exports: [SafeFetcherService] })
export class NetModule {}
