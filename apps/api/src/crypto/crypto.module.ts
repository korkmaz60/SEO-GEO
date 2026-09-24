import { Global, Module } from "@nestjs/common";

import { SecretBoxService } from "./secret-box.js";

@Global()
@Module({ providers: [SecretBoxService], exports: [SecretBoxService] })
export class CryptoModule {}
