import { Body, Controller, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { QaService } from './qa.service';

@Controller('qa')
export class QaController {
  constructor(private readonly qa: QaService) {}

  @Post('ask')
  async ask(@Req() request: Request, @Body() body: any) {
    return this.qa.ask(request, body);
  }
}
