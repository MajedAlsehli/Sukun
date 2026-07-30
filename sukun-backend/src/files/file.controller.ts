import { Response } from 'express';
import { fileService } from './file.service';
import { sendSuccess } from '../shared/response';
import { AuthenticatedRequest } from '../shared/auth.middleware';
import { UploadFileDto } from './file.dto';

export const fileController = {
  async upload(req: AuthenticatedRequest, res: Response) {
    const dto = req.body as UploadFileDto;
    const file = await fileService.upload(dto);
    sendSuccess(res, file, 201);
  },
};
