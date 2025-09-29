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

/**
 * @swagger
 * /api/resume/search:
 *   get:
 *     summary: Search resumes based on various criteria
 *     tags: [Resume]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: skills
 *         schema:
 *           type: string
 *         description: Comma-separated skills to search for
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *         description: Location to search for (city or country)
 *       - in: query
 *         name: languages
 *         schema:
 *           type: string
 *         description: Comma-separated languages to search for
 *       - in: query
 *         name: industry
 *         schema:
 *           type: string
 *         description: Industry to search for
 *       - in: query
 *         name: experience
 *         schema:
 *           type: string
 *         description: Experience level (e.g., "junior", "senior", "mid-level")
 *       - in: query
 *         name: company
 *         schema:
 *           type: string
 *         description: Company name to search for
 *       - in: query
 *         name: education
 *         schema:
 *           type: string
 *         description: Education level or institution
 *       - in: query
 *         name: certification
 *         schema:
 *           type: string
 *         description: Certification name to search for
 *       - in: query
 *         name: minExperienceYears
 *         schema:
 *           type: integer
 *         description: Minimum years of experience
 *       - in: query
 *         name: maxExperienceYears
 *         schema:
 *           type: integer
 *         description: Maximum years of experience
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *         description: Maximum number of resumes to return
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *     responses:
 *       200:
 *         description: Resumes found successfully
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
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/search', verifyToken, async (req, res) => {
  try {
    const {
      skills,
      location,
      languages,
      industry,
      experience,
      company,
      education,
      certification,
      minExperienceYears,
      maxExperienceYears,
      limit = 20,
      page = 1
    } = req.query;

    console.log('Resume search parameters:', req.query);

    // Validate and set limit with maximum cap
    const searchLimit = Math.min(parseInt(limit) || 20, 100); // Default 20, max 100
    const searchPage = Math.max(parseInt(page) || 1, 1); // Minimum page 1

    // Build aggregation pipeline to search in UserProfile collection
    const pipeline = [];

    // Match active resumes first
    pipeline.push({
      $match: {
        isActive: true
      }
    });

    // Lookup user profiles to get searchable fields
    pipeline.push({
      $lookup: {
        from: 'userprofiles',
        localField: 'forUserId',
        foreignField: 'userId',
        as: 'userProfile'
      }
    });

    // Unwind the userProfile array
    pipeline.push({
      $unwind: {
        path: '$userProfile',
        preserveNullAndEmptyArrays: true
      }
    });

    // Build match conditions based on search parameters
    const matchConditions = {};

    // Skills search (case-insensitive, partial match)
    if (skills) {
      const skillsArray = skills.split(',').map(skill => skill.trim());
      matchConditions['userProfile.skills'] = {
        $in: skillsArray.map(skill => new RegExp(skill, 'i'))
      };
    }

    // Location search (search in both city and country)
    if (location) {
      const locationRegex = new RegExp(location, 'i');
      matchConditions.$or = [
        { 'userProfile.location.city': locationRegex },
        { 'userProfile.location.country': locationRegex }
      ];
    }

    // Languages search
    if (languages) {
      const languagesArray = languages.split(',').map(lang => lang.trim());
      matchConditions['userProfile.languages'] = {
        $in: languagesArray.map(lang => new RegExp(lang, 'i'))
      };
    }

    // Industry search
    if (industry) {
      matchConditions['userProfile.industry'] = new RegExp(industry, 'i');
    }

    // Company search (search in current company and experience)
    if (company) {
      const companyRegex = new RegExp(company, 'i');
      matchConditions.$or = matchConditions.$or || [];
      matchConditions.$or.push(
        { 'userProfile.company': companyRegex },
        { 'userProfile.experience.company': companyRegex }
      );
    }

    // Education search (search in school and degree)
    if (education) {
      const educationRegex = new RegExp(education, 'i');
      matchConditions.$or = matchConditions.$or || [];
      matchConditions.$or.push(
        { 'userProfile.education.school': educationRegex },
        { 'userProfile.education.degree': educationRegex },
        { 'userProfile.education.fieldOfStudy': educationRegex }
      );
    }

    // Certification search
    if (certification) {
      const certificationRegex = new RegExp(certification, 'i');
      matchConditions.$or = matchConditions.$or || [];
      matchConditions.$or.push(
        { 'userProfile.certifications.name': certificationRegex },
        { 'userProfile.certifications.organization': certificationRegex }
      );
    }

    // Experience level search (search in headline and experience titles)
    if (experience) {
      const experienceRegex = new RegExp(experience, 'i');
      matchConditions.$or = matchConditions.$or || [];
      matchConditions.$or.push(
        { 'userProfile.headline': experienceRegex },
        { 'userProfile.experience.title': experienceRegex }
      );
    }

    // Add experience years filter using aggregation to calculate years
    if (minExperienceYears || maxExperienceYears) {
      // Add a stage to calculate total experience years
      pipeline.push({
        $addFields: {
          totalExperienceYears: {
            $sum: {
              $map: {
                input: '$userProfile.experience',
                as: 'exp',
                in: {
                  $divide: [
                    {
                      $subtract: [
                        {
                          $cond: {
                            if: '$$exp.current',
                            then: new Date(),
                            else: { $ifNull: ['$$exp.endDate', new Date()] }
                          }
                        },
                        { $ifNull: ['$$exp.startDate', new Date()] }
                      ]
                    },
                    365.25 * 24 * 60 * 60 * 1000 // Convert milliseconds to years
                  ]
                }
              }
            }
          }
        }
      });

      // Add experience years filter to match conditions
      if (minExperienceYears) {
        matchConditions.totalExperienceYears = { $gte: parseInt(minExperienceYears) };
      }
      if (maxExperienceYears) {
        matchConditions.totalExperienceYears = matchConditions.totalExperienceYears || {};
        matchConditions.totalExperienceYears.$lte = parseInt(maxExperienceYears);
      }
    }

    // Apply search filters if any conditions exist
    if (Object.keys(matchConditions).length > 0) {
      pipeline.push({
        $match: matchConditions
      });
    }

    // Add pagination
    const skip = (searchPage - 1) * searchLimit;
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: searchLimit });

    // Project the final result
    pipeline.push({
      $project: {
        resumeId: 1,
        forUserId: 1,
        byUserId: 1,
        name: 1,
        filePath: 1,
        originalFileName: 1,
        fileSize: 1,
        mimeType: 1,
        createdBy: 1,
        isActive: 1,
        downloadCount: 1,
        lastDownloadedAt: 1,
        createdAt: 1,
        updatedAt: 1,
        totalExperienceYears: 1,
        userProfile: {
          userId: 1,
          firstName: 1,
          lastName: 1,
          headline: 1,
          summary: 1,
          location: 1,
          industry: 1,
          company: 1,
          profilePictureUrl: 1,
          skills: 1,
          languages: 1,
          experience: 1,
          education: 1,
          certifications: 1
        }
      }
    });

    console.log('Aggregation pipeline:', JSON.stringify(pipeline, null, 2));

    // Execute the aggregation
    const resumes = await Resume.aggregate(pipeline);

    // Get total count for pagination (run same pipeline without skip/limit)
    const countPipeline = pipeline.slice(0, -2); // Remove skip and limit stages
    countPipeline.push({ $count: 'total' });
    const countResult = await Resume.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    // Generate file URLs for each resume
    const resumesWithUrls = await Promise.all(
      resumes.map(async (resume) => {
        const fileUrl = await getUrl(resume.filePath);
        return {
          ...resume,
          fileUrl: fileUrl,
          formattedFileSize: resume.fileSize ? formatFileSize(resume.fileSize) : 'Unknown',
          matchScore: calculateMatchScore(resume, req.query) // Add relevance score
        };
      })
    );

    // Sort by match score (highest first)
    resumesWithUrls.sort((a, b) => b.matchScore - a.matchScore);

    const totalPages = Math.ceil(total / searchLimit);

    console.log(`Found ${resumes.length} resumes matching search criteria`);

    res.json({
      success: true,
      data: resumesWithUrls,
      pagination: {
        total,
        page: searchPage,
        limit: searchLimit,
        totalPages
      },
      searchCriteria: req.query
    });

  } catch (error) {
    console.error('Error searching resumes:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper function to calculate match score for relevance ranking
function calculateMatchScore(resume, searchParams) {
  let score = 0;
  const userProfile = resume.userProfile;
  
  if (!userProfile) return score;

  // Skills match (high weight)
  if (searchParams.skills && userProfile.skills) {
    const searchSkills = searchParams.skills.split(',').map(s => s.trim().toLowerCase());
    const userSkills = userProfile.skills.map(s => s.toLowerCase());
    const matchingSkills = searchSkills.filter(skill => 
      userSkills.some(userSkill => userSkill.includes(skill))
    );
    score += matchingSkills.length * 10;
  }

  // Industry match (medium weight)
  if (searchParams.industry && userProfile.industry) {
    if (userProfile.industry.toLowerCase().includes(searchParams.industry.toLowerCase())) {
      score += 5;
    }
  }

  // Location match (medium weight)
  if (searchParams.location && userProfile.location) {
    const locationLower = searchParams.location.toLowerCase();
    if (userProfile.location.city?.toLowerCase().includes(locationLower) ||
        userProfile.location.country?.toLowerCase().includes(locationLower)) {
      score += 5;
    }
  }

  // Languages match (low weight)
  if (searchParams.languages && userProfile.languages) {
    const searchLanguages = searchParams.languages.split(',').map(l => l.trim().toLowerCase());
    const userLanguages = userProfile.languages.map(l => l.toLowerCase());
    const matchingLanguages = searchLanguages.filter(lang => 
      userLanguages.some(userLang => userLang.includes(lang))
    );
    score += matchingLanguages.length * 2;
  }

  // Experience years match (medium weight)
  if (resume.totalExperienceYears) {
    if (searchParams.minExperienceYears && resume.totalExperienceYears >= parseInt(searchParams.minExperienceYears)) {
      score += 3;
    }
    if (searchParams.maxExperienceYears && resume.totalExperienceYears <= parseInt(searchParams.maxExperienceYears)) {
      score += 3;
    }
  }

  return score;
}

export default router;