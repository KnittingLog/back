import {
  INestApplication,
  RequestMethod,
  VersioningType,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { MyConfiguration } from "./MyConfiguration";
import { MyModule } from "./MyModule";
import { MyGlobal } from "./MyGlobal";
import { KnittingLogExceptionFilter } from "./controllers/knittinglog/KnittingLogExceptionFilter";

export class MyBackend {
  private application_?: INestApplication;

  public static configure(application: INestApplication): void {
    application.setGlobalPrefix("api", {
      exclude: [{ path: "monitors/{*path}", method: RequestMethod.ALL }],
    });
    application.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: "1",
    });
    application.useGlobalFilters(new KnittingLogExceptionFilter());
    application.enableCors();
  }

  public async open(): Promise<void> {
    // MOUNT CONTROLLERS
    this.application_ = await NestFactory.create(MyModule, { logger: false });

    // DO OPEN
    MyBackend.configure(this.application_);
    await this.application_.listen(
      MyConfiguration.API_PORT(),
      MyGlobal.mode === "local" ? "127.0.0.1" : "0.0.0.0",
    );
  }

  public async close(): Promise<void> {
    if (this.application_ === undefined) return;

    // DO CLOSE
    await this.application_.close();
    delete this.application_;
  }
}
