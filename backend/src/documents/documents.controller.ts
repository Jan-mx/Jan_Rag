import { Body, Controller, Delete, Get, Param, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { ok } from '../common/api-response';
import { DocumentsService } from './documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@Req() request: Request, @Body('groupId') groupId: string, @UploadedFile() file: Express.Multer.File) {
    return ok(await this.documents.upload(request, Number(groupId), file));
  }

  @Get()
  async list(@Req() request: Request, @Query() query: any) {
    return this.documents.list(request, query);
  }

  @Delete(':documentId')
  async remove(@Req() request: Request, @Param('documentId') documentId: string, @Query('groupId') groupId: string) {
    await this.documents.softDelete(request, Number(groupId), Number(documentId));
    return ok(null);
  }

  @Get(':documentId/preview')
  async preview(@Req() request: Request, @Param('documentId') documentId: string, @Query('groupId') groupId: string) {
    return this.documents.preview(request, Number(groupId), Number(documentId));
  }
}
