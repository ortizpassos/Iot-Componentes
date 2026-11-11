import { Controller, Get } from '@nestjs/common';

@Controller(['health', 'heath'])
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'iot-platform-api',
      timestamp: new Date().toISOString(),
    };
  }
}
