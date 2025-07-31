import express from 'express';
const router = express.Router();
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import AWS from 'aws-sdk';
import Resume from '../models/Resume.js';
import UserProfile from '../models/UserProfile.js';
import jwt from 'jsonwebtoken';
import { getUrl } from '../utils/cloudfront.js';
import dotenv from 'dotenv';

dotenv.config();

// Configure AWS S3
const s3 = new AWS.S3({
  region: 'ap-south-1'
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'dintak-media-ap-south-1-bucket';

// Function to sanitize filename by removing spaces and special characters
const sanitizeFileName = (fileName) => {
  if (!fileName) return '';
  
  // Extract file name and extension
  const lastDotIndex = fileName.lastIndexOf('.');
  const name = lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
  const extension = lastDotIndex > 0 ? fileName.substring(lastDotIndex) : '';
  
  // Remove spaces and special characters, keep only alphanumeric, hyphens, and underscores
  const sanitizedName = name
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/[^a-zA-Z0-9_-]/g, '') // Remove special characters except underscores and hyphens
    .replace(/_+/g, '_') // Replace multiple underscores with single underscore
    .replace(/^_+|_+$/g, ''); // Remove leading and trailing underscores
  
  // Ensure the name is not empty
  const finalName = sanitizedName || 'resume';
  
  return finalName + extension;
};

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only PDF, DOC, and DOCX files
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, and DOCX files are allowed'), false);
    }
  }
});

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    console.log('No token provided');
    return res.status(401).json({
      success: false,
      message: 'Access token required'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key');
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

// Validation middleware for resume creation
const validateResumeUpload = [
  body('forUserId')
    .trim()
    .isLength({ min: 1 })
    .withMessage('User ID is required'),
  
  body('byUserId')
    .trim()
    .isLength({ min: 1 })
    .withMessage('User ID is required'),

  body('name')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Resume name is required and must be less than 200 characters'),

  // Middleware to check validation results
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  }
];

/**
 * @swagger
 * components:
 *   schemas:
 *     Resume:
 *       type: object
 *       required:
 *         - resumeId
 *         - userId
 *         - name
 *         - filePath
 *         - createdBy
 *       properties:
 *         resumeId:
 *           type: string
 *           description: Unique identifier for the resume
 *         userId:
 *           type: string
 *           description: User ID who owns the resume
 *         name:
 *           type: string
 *           description: Name/title of the resume
 *         filePath:
 *           type: string
 *           description: S3 file path of the resume
 *         originalFileName:
 *           type: string
 *           description: Original filename of the uploaded file
 *         fileSize:
 *           type: number
 *           description: File size in bytes
 *         mimeType:
 *           type: string
 *           description: MIME type of the file
 *         createdBy:
 *           type: string
 *           description: Email of the user who created the resume
 *         isActive:
 *           type: boolean
 *           description: Whether the resume is active
 *         downloadCount:
 *           type: number
 *           description: Number of times the resume has been downloaded
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 */

/**
 * @swagger
 * /api/resume:
 *   post:
 *     summary: Upload a resume file (PDF, DOC, DOCX)
 *     tags: [Resume]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               resume:
 *                 type: string
 *                 format: binary
 *                 description: Resume file (PDF, DOC, or DOCX)
 *               userId:
 *                 type: string
 *                 description: User ID who owns the resume
 *               name:
 *                 type: string
 *                 description: Name/title for the resume
 *     responses:
 *       201:
 *         description: Resume uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Resume'
 *       400:
 *         description: Validation error or invalid file
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/', verifyToken, upload.single('resume'), validateResumeUpload, async (req, res) => {
  try {
    console.log('Uploading resume with data:', req.body);
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No resume file provided'
      });
    }
    

    const resumeName = req.body.name;
    const forUserId = req.body.forUserId || userId; // Use forUserId if provided
    const byUserId = req.body.byUserId || userId; // Use byUserId if provided
    if (!forUserId || !byUserId || !resumeName) {
      return res.status(400).json({
        success: false,
        message: 'Some critical fields are missing: Please contact admin to resolve this issue'
      });
    }
    const defaultResume = req.body.defaultResume || false; 
        
    console.log('Resume upload details:', {
      forUserId,
      byUserId,
      resumeName,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype
    });

    // Check if resume name already exists for this user
    const existingResume = await Resume.findOne({ 
      forUserId: forUserId,
      name: resumeName
    });

    if (existingResume) {
      return res.status(400).json({
        success: false,
        message: 'A resume with this name already exists for this user. Please choose a different name.'
      });
    }

    // Sanitize the original filename to remove spaces and special characters
    const sanitizedFileName = sanitizeFileName(req.file.originalname);
    console.log('Original filename:', req.file.originalname);
    console.log('Sanitized filename:', sanitizedFileName);

    // Generate unique filename with sanitized name
    const fileExtension = req.file.originalname.split('.').pop();
    const timestamp = Date.now();
    const fileName = `resumes/${forUserId}/${timestamp}/${sanitizedFileName}`;

    console.log('S3 file path:', fileName);

    // Upload to S3
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      Metadata: {
        'uploaded-by': byUserId,
        'for-user-id': forUserId,
        'original-name': req.file.originalname
      }
    };

    console.log('S3 upload parameters:', {
      ...uploadParams,
      Body: '[FILE_BUFFER]'
    });

    const uploadResult = await s3.upload(uploadParams).promise();
    console.log('S3 upload result:', uploadResult);

    // Create resume record in MongoDB
    const resume = new Resume({
      forUserId: forUserId,
      byUserId: byUserId,
      name: resumeName,
      filePath: fileName,
      originalFileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      createdBy: byUserId
    });

    await resume.save();
    console.log('Resume record saved to MongoDB:', resume);

    // If defaultResume is true, update the UserProfile with this resume ID
    if (defaultResume === 'true' || defaultResume === true) {
      try {
        const userProfile = await UserProfile.findOneAndUpdate(
          { userId: forUserId },
          { defaultResume: resume._id.toString() },
          { new: true }
        );
        
        if (userProfile) {
          console.log('Updated UserProfile with default resume:', resume._id.toString());
        } else {
          console.log('UserProfile not found for userId:', forUserId);
        }
      } catch (updateError) {
        console.error('Error updating UserProfile with default resume:', updateError);
        // Don't fail the entire request if profile update fails
      }
    }

    // Generate CloudFront URL for response
    const fileUrl = await getUrl(fileName);
    console.log('Generated file URL:', fileUrl);

    
    res.status(201).json({
      success: true,
      message: 'Resume uploaded successfully',
      data: {
        ...resume.toObject(),
        fileUrl: fileUrl
      }
    });

  } catch (error) {
    console.error('Error uploading resume:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload resume',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/resume/{userId}:
 *   get:
 *     summary: Get all resumes for a user
 *     tags: [Resume]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to get resumes for
 *     responses:
 *       200:
 *         description: Resumes retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Resume'
 *       404:
 *         description: No resumes found
 *       401:
 *         description: Unauthorized
 */
router.get('/:forUserId', verifyToken, async (req, res) => {
  try {
    const forUserId = req.params.forUserId;
    console.log('Fetching resumes for userId:', forUserId);
    
    const resumes = await Resume.find({ 
      forUserId: forUserId,
    }).sort({ createdAt: -1 });
    
    if (!resumes || resumes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No resumes found for this user'
      });
    }

    // Generate file URLs for each resume
    const resumesWithUrls = await Promise.all(
      resumes.map(async (resume) => {
        const fileUrl = await getUrl(resume.filePath);
        return {
          ...resume.toObject(),
          name: resume.name,
          originalFileName: resume.originalFileName,
          uploadedDate: resume.createdAt,
          fileSize: resume.fileSize,
          formattedFileSize: resume.getFormattedFileSize(),
          mimeType: resume.mimeType,
          resumeId: resume.resumeId || resume._id.toString()
        };
      })
    );

    res.json({
      success: true,
      data: resumesWithUrls
    });
  } catch (error) {
    console.error('Error fetching resumes:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/resume/details/{resumeId}:
 *   get:
 *     summary: Get resume details by resumeId
 *     tags: [Resume]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: resumeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Resume ID
 *     responses:
 *       200:
 *         description: Resume details retrieved successfully
 *       404:
 *         description: Resume not found
 *       401:
 *         description: Unauthorized
 */
router.get('/details/:resumeId', verifyToken, async (req, res) => {
  try {
    const resumeId = req.params.resumeId;
    console.log('Fetching resume details for resumeId:', resumeId);
    
    const resume = await Resume.findOne({ 
      resumeId: resumeId,
      isActive: true 
    });
    
    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
    }

    // Generate file URL
    const fileUrl = await getUrl(resume.filePath);

    res.json({
      success: true,
      data: {
        ...resume.toObject(),
        fileUrl: fileUrl
      }
    });
  } catch (error) {
    console.error('Error fetching resume details:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/resume/{resumeId}:
 *   put:
 *     summary: Update resume details
 *     tags: [Resume]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: resumeId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: New name for the resume
 *     responses:
 *       200:
 *         description: Resume updated successfully
 *       404:
 *         description: Resume not found
 *       403:
 *         description: Forbidden - not owner
 */
router.put('/:resumeId', verifyToken, async (req, res) => {
  try {
    const resumeId = req.params.resumeId;
    const { name } = req.body;
    
    console.log('Updating resume:', resumeId, 'with name:', name);
    
    const resume = await Resume.findOne({ resumeId: resumeId });
    
    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
    }

    // Check if user is the owner or creator
    if (resume.userId !== req.user.userId && resume.createdBy !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own resumes'
      });
    }

    // Update resume
    if (name) resume.name = name;
    await resume.save();

    // Generate file URL
    const fileUrl = await getUrl(resume.filePath);

    res.json({
      success: true,
      message: 'Resume updated successfully',
      data: {
        ...resume.toObject(),
        fileUrl: fileUrl
      }
    });
  } catch (error) {
    console.error('Error updating resume:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/resume/{resumeId}:
 *   delete:
 *     summary: Delete resume (soft delete)
 *     tags: [Resume]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: resumeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Resume deleted successfully
 *       404:
 *         description: Resume not found
 *       403:
 *         description: Forbidden - not owner
 */
router.delete('/:resumeId', verifyToken, async (req, res) => {
  try {
    const resumeId = req.params.resumeId;
    console.log('Deleting resume:', resumeId);
    
    const resume = await Resume.findOne({ resumeId: resumeId });
    
    if (!resume) {
      console.log('Resume not found:', resumeId);
      return res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
    }

    // Check if user is the owner or creator
    if (resume.forUserId !== req.user.userId && resume.createdBy !== req.user.userId) {
      console.log('Unauthorized delete attempt by user:', req.user.userId);
      console.error('You can only delete your own resumes');
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own resumes'
      });
    }

    // Delete file from S3 bucket
    try {
      const deleteParams = {
        Bucket: BUCKET_NAME,
        Key: resume.filePath
      };
      
      console.log('Deleting file from S3:', resume.filePath);
      await s3.deleteObject(deleteParams).promise();
      console.log('File deleted from S3 successfully');
    } catch (s3Error) {
      console.error('Error deleting file from S3:', s3Error);
      // Continue with database deletion even if S3 deletion fails
      // This prevents orphaned database records
    }

    // Hard delete - remove from database
    await Resume.deleteOne({ resumeId: resumeId });
    console.log('Resume record deleted from database');

    res.json({
      success: true,
      message: 'Resume deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting resume:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/resume/download/{resumeId}:
 *   get:
 *     summary: Download resume file
 *     tags: [Resume]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: resumeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Resume download URL generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 downloadUrl:
 *                   type: string
 *       404:
 *         description: Resume not found
 */
router.get('/download/:resumeId', verifyToken, async (req, res) => {
  try {
    const resumeId = req.params.resumeId;
    console.log('Generating download URL for resume:', resumeId);
    
    const resume = await Resume.findOne({ 
      resumeId: resumeId,
      isActive: true 
    });
    
    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
    }

    // Update download count
    resume.downloadCount += 1;
    resume.lastDownloadedAt = new Date();
    await resume.save();

    // Generate download URL
    const downloadUrl = await getUrl(resume.filePath);

    res.json({
      success: true,
      downloadUrl: downloadUrl,
      fileName: resume.originalFileName,
      fileSize: resume.getFormattedFileSize()
    });
  } catch (error) {
    console.error('Error generating download URL:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;