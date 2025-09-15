import multer from 'multer';
import { Request } from 'express';
import { validateVideoFile, logger } from '@video-platform/shared';

// Configure multer for file uploads
const storage = multer.memoryStorage();

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const validation = validateVideoFile(file);
  
  if (!validation.valid) {
    logger.warn('File validation failed', {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      error: validation.error,
    });
    
    cb(new Error(validation.error || 'Invalid file'));
    return;
  }

  cb(null, true);
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
    files: 1, // Only one file at a time
  },
});

// Error handler for multer errors
export const handleUploadError = (error: any, req: Request, res: any, next: any) => {
  if (error instanceof multer.MulterError) {
    let message = 'Upload error';
    let code = 'UPLOAD_ERROR';

    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'File size exceeds 500MB limit';
        code = 'FILE_TOO_LARGE';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files. Only one file allowed per upload';
        code = 'TOO_MANY_FILES';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field';
        code = 'UNEXPECTED_FILE';
        break;
      default:
        message = error.message;
    }

    logger.warn('Multer upload error', {
      code: error.code,
      message: error.message,
      field: error.field,
    });

    return res.status(400).json({
      success: false,
      error: {
        code,
        message,
        timestamp: new Date().toISOString(),
      },
    });
  }

  if (error.message && error.message.includes('Invalid file')) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_FILE_TYPE',
        message: error.message,
        timestamp: new Date().toISOString(),
      },
    });
  }

  next(error);
};