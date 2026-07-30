import crypto from 'crypto';
import { fileRepository } from './file.repository';
import { toFileDto } from './file.mapper';
import { extensionFromMimeType, writeLocalFile } from './storage.util';
import { UploadFileDto } from './file.dto';
import { ValidationError } from '../shared/errors';

export const fileService = {
  // POST /api/files/upload - "Returns File URL, File ID, Hash"
  async upload(dto: UploadFileDto) {
    let buffer: Buffer;
    try {
      buffer = Buffer.from(dto.contentBase64, 'base64');
    } catch {
      throw new ValidationError('Invalid base64 content');
    }
    if (buffer.length === 0) {
      throw new ValidationError('Uploaded file is empty');
    }

    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const extension = extensionFromMimeType(dto.mimeType) || '';
    const { storageKey } = writeLocalFile(buffer, extension);

    const file = await fileRepository.create({
      storageKey,
      url: `/files/${storageKey}`,
      hash,
      mimeType: dto.mimeType,
      size: buffer.length,
    });

    return toFileDto(file);
  },
};
