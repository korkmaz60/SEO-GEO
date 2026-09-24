import { Global, Module } from "@nestjs/common";

import { CredentialsService } from "./credentials.service.js";
import { DATAFORSEO_OPTIONS, DataForSeoGateway } from "./dataforseo.gateway.js";

@Global()
@Module({
  providers: [{ provide: DATAFORSEO_OPTIONS, useValue: {} }, DataForSeoGateway, CredentialsService],
  exports: [DataForSeoGateway, CredentialsService],
})
export class CredentialsModule {}
