import { Router } from 'express';
import { fileController } from './file.controller';
import { validateBody } from '../shared/validateBody';
import { uploadFileSchema } from './file.dto';
import { asyncHandler } from '../shared/asyncHandler';
import { authMiddleware } from '../shared/auth.middleware';

export const fileRouter = Router();
fileRouter.use(authMiddleware);

/**
 * @openapi
 * /files/upload:
 *   post:
 *     tags: [Files]
 *     summary: Upload a file (JSON+base64; local-disk MVP storage per DB-007 - metadata only in DB)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fileName, mimeType, contentBase64]
 *             properties:
 *               fileName: { type: string }
 *               mimeType: { type: string }
 *               contentBase64: { type: string }
 *     responses:
 *       201: { description: File uploaded }
 */
fileRouter.post('/upload', validateBody(uploadFileSchema), asyncHandler(fileController.upload));
