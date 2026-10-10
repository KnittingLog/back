import { Module } from "@nestjs/common";
import { MonitorModule } from "./controllers/monitors/MonitorModule";
import { KnittingLogModule } from "./controllers/knittinglog/KnittingLogModule";

@Module({
  imports: [MonitorModule, KnittingLogModule],
})
export class MyModule {}
