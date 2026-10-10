import { INestiaConfig } from "@nestia/sdk";
import { NestFactory } from "@nestjs/core";

import { MyModule } from "./src/MyModule";
import { MyBackend } from "./src/MyBackend";

export const NESTIA_CONFIG: INestiaConfig = {
  input: async () => {
    const application = await NestFactory.create(MyModule);
    MyBackend.configure(application);
    return application;
  },
  output: "../api/src",
  swagger: {
    output: "../api/swagger.json",
    servers: [
      {
        url: "http://localhost:37001",
        description: "Local Server",
      },
    ],
    beautify: true,
  },
  keyword: true,
  simulate: true,
  primitive: false,
  clone: true,
};
export default NESTIA_CONFIG;
