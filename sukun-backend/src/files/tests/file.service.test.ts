import { fileService } from '../file.service';
import { fileRepository } from '../file.repository';
import { writeLocalFile } from '../storage.util';
import { uploadFileSchema } from '../file.dto';

jest.mock('../file.repository');
jest.mock('../storage.util');

const mockedRepo = fileRepository as jest.Mocked<typeof fileRepository>;
const mockedStorage = writeLocalFile as jest.MockedFunction<typeof writeLocalFile>;

describe('fileService.upload', () => {
  it('rejects empty content', async () => {
    await expect(
      fileService.upload({ fileName: 'a.jpg', mimeType: 'image/jpeg', contentBase64: '' }),
    ).rejects.toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });

  it('decodes base64, hashes it, writes to disk, and stores metadata', async () => {
    mockedStorage.mockReturnValue({ storageKey: 'abc123.jpg' });
    mockedRepo.create.mockResolvedValue({
      id: 'file-1',
      storageKey: 'abc123.jpg',
      url: '/files/abc123.jpg',
      hash: 'deadbeef',
      mimeType: 'image/jpeg',
      size: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const content = Buffer.from('hello').toString('base64');
    const result = await fileService.upload({
      fileName: 'a.jpg',
      mimeType: 'image/jpeg',
      contentBase64: content,
    });

    expect(mockedRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'image/jpeg', size: 5, url: '/files/abc123.jpg' }),
    );
    expect(result.url).toBe('/files/abc123.jpg');
  });
});

describe('uploadFileSchema', () => {
  it('rejects a mimeType outside the known allow-list', () => {
    // Previously z.string().min(1) accepted anything; an unrecognized type
    // would silently get stored with no file extension (storage.util.ts's
    // extensionFromMimeType falls back to '').
    const result = uploadFileSchema.safeParse({
      fileName: 'a.exe',
      mimeType: 'application/x-msdownload',
      contentBase64: 'aGVsbG8=',
    });
    expect(result.success).toBe(false);
  });

  it('accepts known mimeTypes', () => {
    for (const mimeType of ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']) {
      const result = uploadFileSchema.safeParse({
        fileName: 'a.bin',
        mimeType,
        contentBase64: 'aGVsbG8=',
      });
      expect(result.success).toBe(true);
    }
  });
});
