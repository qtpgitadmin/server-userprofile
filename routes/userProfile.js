import express from 'express';
const router = express.Router();
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import AWS from 'aws-sdk';
import UserProfile from '../models/UserProfile.js';
import Connection from '../models/Connection.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';


import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { getUrl } from '../utils/cloudfront.js';

dotenv.config();
// Initialize AWS SDK

// Configure AWS S3
const s3 = new AWS.S3({
  region: 'ap-south-1'
});

// const upload = multer({ dest: 'uploads/' });

// const s3 = new S3Client({
//   region: process.env.AWS_REGION
//   //,
//   // credentials: {
//   //   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//   //   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//   // },
// });

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'dintak-media-ap-south-1-bucket';

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
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
    //const jwt = require('jsonwebtoken');
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
  // async function getPrivateKey() {
  //   try {
  //     const client = new SecretsManagerClient({
  //     region: "ap-south-1",
  //     });
  //     const secret_name = "cloudfront/privatekey";
  //     const command = new GetSecretValueCommand({ SecretId: secret_name });
  //     const response = await client.send(command);
  //     return response.SecretString;
  //   } catch (error) {
  //     logger.error('Error retrieving private key from Secrets Manager', error, 'ProfilePage', 'get_private_key');
  //     throw error;
  //   }
  // }

  // async function generateSignedUrl(s3ObjectKey: string) {
  //   const privateKey = await getPrivateKey();
  //   if (!privateKey) {
  //     throw new Error('CloudFront private key could not be retrieved');
  //   }
  //   const keyPairId = process.env.CLOUDFRONT_KEY_ID;
  //   if (!keyPairId) {
  //     throw new Error('CLOUDFRONT_KEY_PAIR_ID environment variable is not set');
  //   }

  //   const cloudfrontMediaDomain = process.env.CLOUDFRONT_MEDIA_DOMAIN_NAME;
  //   // const s3ObjectKey = "media/user123/photo.jpg";
  //   const url = `${cloudfrontMediaDomain}/${s3ObjectKey}`;

  //   const signedUrl = getSignedUrl({
  //     url,
  //     keyPairId,
  //     dateLessThan: new Date(Date.now() + 5 * 60 * 1000), // 5 min expiry
  //     privateKey: privateKey as string,
  //   });

  //   console.log(signedUrl);
  // }

/**
 * @swagger
 * components:
 *   schemas:
 *     UserProfile:
 *       type: object
 *       required:
 *         - firstName
 *         - lastName
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the profile
 *         firstName:
 *           type: string
 *           description: First name of the user
 *         lastName:
 *           type: string
 *           description: Last name of the user
 *         headline:
 *           type: string
 *           description: Professional headline or tagline
 *         summary:
 *           type: string
 *           description: Professional summary or about section
 *         location:
 *           type: object
 *           properties:
 *             country:
 *               type: string
 *             city:
 *               type: string
 *         industry:
 *           type: string
 *           description: Professional industry
 *         company:
 *           type: string
 *           description: Current company or organization
 *         profilePictureUrl:
 *           type: string
 *           description: URL of the profile picture
 *         backgroundPictureUrl:
 *           type: string
 *           description: URL of the background image
 *         contactInfo:
 *           type: object
 *           properties:
 *             email:
 *               type: string
 *             phone:
 *               type: string
 *             websites:
 *               type: array
 *               items:
 *                 type: string
 */

// Comprehensive validation for user profile creation
const validateCreateUserProfile = [
  body('userId').trim().isLength({ min: 1 }).withMessage('User ID is required'),
  body('firstName').trim().isLength({ min: 1, max: 100 }).withMessage('First name is required and must be less than 100 characters'),
  body('lastName').trim().isLength({ min: 1, max: 100 }).withMessage('Last name is required and must be less than 100 characters'),
  body('headline').optional().trim().isLength({ max: 200 }).withMessage('Headline must be less than 200 characters'),
  body('summary').optional().trim().isLength({ max: 2000 }).withMessage('Summary must be less than 2000 characters'),
  body('location.country').optional().trim().isLength({ max: 100 }).withMessage('Country must be less than 100 characters'),
  body('location.city').optional().trim().isLength({ max: 100 }).withMessage('City must be less than 100 characters'),
  body('industry').optional().trim().isLength({ max: 100 }).withMessage('Industry must be less than 100 characters'),
  body('company').optional().trim().isLength({ max: 100 }).withMessage('Company must be less than 100 characters'),
  body('profilePictureUrl').optional().isURL().withMessage('Profile picture URL must be valid'),
  body('backgroundPictureUrl').optional().isURL().withMessage('Background picture URL must be valid'),
  body('contactInfo.email').optional().isEmail().withMessage('Valid email is required'),
  body('contactInfo.phone').optional().trim().isLength({ max: 20 }).withMessage('Phone number must be less than 20 characters'),
  body('contactInfo.websites').optional().isArray().withMessage('Websites must be an array'),
  body('contactInfo.websites.*').optional().isURL().withMessage('Each website must be a valid URL'),
  body('experience').optional().isArray().withMessage('Experience must be an array'),
  body('experience.*.title').optional().trim().isLength({ max: 100 }).withMessage('Experience title must be less than 100 characters'),
  body('experience.*.company').optional().trim().isLength({ max: 100 }).withMessage('Company name must be less than 100 characters'),
  body('experience.*.location').optional().trim().isLength({ max: 100 }).withMessage('Experience location must be less than 100 characters'),
  body('experience.*.startDate').optional().isISO8601().withMessage('Start date must be a valid date'),
  body('experience.*.endDate').optional().isISO8601().withMessage('End date must be a valid date'),
  body('experience.*.current').optional().isBoolean().withMessage('Current must be a boolean'),
  body('experience.*.description').optional().trim().isLength({ max: 2000 }).withMessage('Experience description must be less than 2000 characters'),
  body('education').optional().isArray().withMessage('Education must be an array'),
  body('education.*.school').optional().trim().isLength({ max: 100 }).withMessage('School name must be less than 100 characters'),
  body('education.*.degree').optional().trim().isLength({ max: 100 }).withMessage('Degree must be less than 100 characters'),
  body('education.*.fieldOfStudy').optional().trim().isLength({ max: 100 }).withMessage('Field of study must be less than 100 characters'),
  body('education.*.startDate').optional().isISO8601().withMessage('Start date must be a valid date'),
  body('education.*.endDate').optional().isISO8601().withMessage('End date must be a valid date'),
  body('education.*.description').optional().trim().isLength({ max: 1000 }).withMessage('Education description must be less than 1000 characters'),
  body('skills').optional().isArray().withMessage('Skills must be an array'),
  body('skills.*').optional().trim().isLength({ max: 50 }).withMessage('Each skill must be less than 50 characters'),
  body('languages').optional().isArray().withMessage('Languages must be an array'),
  body('languages.*').optional().trim().isLength({ max: 50 }).withMessage('Each language must be less than 50 characters'),
  body('certifications').optional().isArray().withMessage('Certifications must be an array'),
  body('certifications.*.name').optional().trim().isLength({ max: 100 }).withMessage('Certification name must be less than 100 characters'),
  body('certifications.*.organization').optional().trim().isLength({ max: 100 }).withMessage('Organization must be less than 100 characters'),
  body('certifications.*.issueDate').optional().isISO8601().withMessage('Issue date must be a valid date'),
  body('certifications.*.expirationDate').optional().isISO8601().withMessage('Expiration date must be a valid date'),
  body('certifications.*.credentialId').optional().trim().isLength({ max: 100 }).withMessage('Credential ID must be less than 100 characters'),
  body('publications').optional().isArray().withMessage('Publications must be an array'),
  body('publications.*.title').optional().trim().isLength({ max: 200 }).withMessage('Publication title must be less than 200 characters'),
  body('publications.*.publisher').optional().trim().isLength({ max: 100 }).withMessage('Publisher must be less than 100 characters'),
  body('publications.*.publicationDate').optional().isISO8601().withMessage('Publication date must be a valid date'),
  body('publications.*.url').optional().isURL().withMessage('Publication URL must be valid'),
  body('volunteerExperience').optional().isArray().withMessage('Volunteer experience must be an array'),
  body('volunteerExperience.*.organization').optional().trim().isLength({ max: 100 }).withMessage('Organization must be less than 100 characters'),
  body('volunteerExperience.*.role').optional().trim().isLength({ max: 100 }).withMessage('Role must be less than 100 characters'),
  body('volunteerExperience.*.startDate').optional().isISO8601().withMessage('Start date must be a valid date'),
  body('volunteerExperience.*.endDate').optional().isISO8601().withMessage('End date must be a valid date'),
  body('volunteerExperience.*.description').optional().trim().isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
  body('recommendations').optional().isArray().withMessage('Recommendations must be an array'),
  body('recommendations.*.recommender').optional().trim().isLength({ max: 100 }).withMessage('Recommender must be less than 100 characters'),
  body('recommendations.*.relationship').optional().trim().isLength({ max: 100 }).withMessage('Relationship must be less than 100 characters'),
  body('recommendations.*.text').optional().trim().isLength({ max: 2000 }).withMessage('Recommendation text must be less than 2000 characters'),
  body('recommendations.*.date').optional().isISO8601().withMessage('Date must be a valid date')
];

// Simplified validation for basic operations
const validateUserProfile = [
  body('firstName').trim().isLength({ min: 1, max: 100 }).withMessage('First name is required and must be less than 100 characters'),
  body('lastName').trim().isLength({ min: 1, max: 100 }).withMessage('Last name is required and must be less than 100 characters'),
  body('headline').optional().trim().isLength({ max: 200 }).withMessage('Headline must be less than 200 characters'),
  body('summary').optional().trim().isLength({ max: 2000 }).withMessage('Summary must be less than 2000 characters'),
  body('location.country').optional().trim().isLength({ max: 100 }).withMessage('Country must be less than 100 characters'),
  body('location.city').optional().trim().isLength({ max: 100 }).withMessage('City must be less than 100 characters'),
  body('industry').optional().trim().isLength({ max: 100 }).withMessage('Industry must be less than 100 characters'),
  body('company').optional().trim().isLength({ max: 100 }).withMessage('Company must be less than 100 characters'),
  body('contactInfo.email').optional().isEmail().withMessage('Valid email is required'),
  body('contactInfo.phone').optional().trim().isLength({ max: 20 }).withMessage('Phone number must be less than 20 characters'),
  body('contactInfo.websites').optional().isArray().withMessage('Websites must be an array'),
  body('experience').optional().isArray().withMessage('Experience must be an array'),
  body('education').optional().isArray().withMessage('Education must be an array'),
  body('skills').optional().isArray().withMessage('Skills must be an array'),
  body('languages').optional().isArray().withMessage('Languages must be an array'),
  body('certifications').optional().isArray().withMessage('Certifications must be an array'),
  body('publications').optional().isArray().withMessage('Publications must be an array'),
  body('volunteerExperience').optional().isArray().withMessage('Volunteer experience must be an array'),
  body('recommendations').optional().isArray().withMessage('Recommendations must be an array')
];

/**
 * @swagger
 * /api/userprofile/create:
 *   post:
 *     summary: Create a new user profile with comprehensive data
 *     tags: [UserProfile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - firstName
 *               - lastName
 *             properties:
 *               userId:
 *                 type: string
 *                 description: Unique user identifier
 *               firstName:
 *                 type: string
 *                 description: First name of the user
 *               lastName:
 *                 type: string
 *                 description: Last name of the user
 *               headline:
 *                 type: string
 *                 description: Professional headline
 *               summary:
 *                 type: string
 *                 description: Professional summary
 *               location:
 *                 type: object
 *                 properties:
 *                   country:
 *                     type: string
 *                   city:
 *                     type: string
 *               industry:
 *                 type: string
 *               company:
 *                 type: string
 *               profilePictureUrl:
 *                 type: string
 *               backgroundPictureUrl:
 *                 type: string
 *               contactInfo:
 *                 type: object
 *                 properties:
 *                   email:
 *                     type: string
 *                   phone:
 *                     type: string
 *                   websites:
 *                     type: array
 *                     items:
 *                       type: string
 *               experience:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     title:
 *                       type: string
 *                     company:
 *                       type: string
 *                     location:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     endDate:
 *                       type: string
 *                       format: date
 *                     current:
 *                       type: boolean
 *                     description:
 *                       type: string
 *               education:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     school:
 *                       type: string
 *                     degree:
 *                       type: string
 *                     fieldOfStudy:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     endDate:
 *                       type: string
 *                       format: date
 *                     description:
 *                       type: string
 *               skills:
 *                 type: array
 *                 items:
 *                   type: string
 *               languages:
 *                 type: array
 *                 items:
 *                   type: string
 *               certifications:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     organization:
 *                       type: string
 *                     issueDate:
 *                       type: string
 *                       format: date
 *                     expirationDate:
 *                       type: string
 *                       format: date
 *                     credentialId:
 *                       type: string
 *               publications:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     title:
 *                       type: string
 *                     publisher:
 *                       type: string
 *                     publicationDate:
 *                       type: string
 *                       format: date
 *                     url:
 *                       type: string
 *               volunteerExperience:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     organization:
 *                       type: string
 *                     role:
 *                       type: string
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     endDate:
 *                       type: string
 *                       format: date
 *                     description:
 *                       type: string
 *               recommendations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     recommender:
 *                       type: string
 *                     relationship:
 *                       type: string
 *                     text:
 *                       type: string
 *                     date:
 *                       type: string
 *                       format: date
 *     responses:
 *       201:
 *         description: User profile created successfully
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
 *                   $ref: '#/components/schemas/UserProfile'
 *       400:
 *         description: Validation error or profile already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       500:
 *         description: Internal server error
 */
router.post('/', verifyToken, validateCreateUserProfile, async (req, res) => {
  try {
    console.log('Creating user profile with data:', req.body);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { userId } = req.body;
    console.log('User ID from request body:', userId);
    // Check if profile already exists
    const existingProfile = await UserProfile.findOne({ userId: userId });
    if (existingProfile) {
      console.log('User profile already exists for userId:', userId);
      return res.status(400).json({
        success: false,
        message: 'User profile already exists for this userId'
      });
    }
    console.log('No existing profile found for userId:', userId); 

    // Create new user profile with all provided data
    const userProfile = new UserProfile({
      ...req.body,
      //id: req.body.id || userId // Use provided id or fallback to userId
      id: new mongoose.Types.ObjectId() // Generate a new ObjectId for the profile
    });

    console.log('New user profile data:', userProfile);
    await userProfile.save();
    console.log('User profile created successfully:', userProfile);
    res.status(201).json({
      success: true,
      message: 'User profile created successfully',
      data: userProfile
    });
  } catch (error) {
    console.log('Error creating user profile:', error); 
    if (error.code === 11000) {
      // Handle duplicate key error
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `A profile with this ${field} already exists`
      });
    }
    console.error('Error creating user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/userprofile:
 *   post:
 *     summary: Create user profile (basic)
 *     tags: [UserProfile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserProfile'
 *     responses:
 *       201:
 *         description: User profile created successfully
 *       400:
 *         description: Validation error or profile already exists
 */
router.post('/', verifyToken, validateUserProfile, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.body.userId || req.user.userId;
    
    // Check if profile already exists
    const existingProfile = await UserProfile.findOne({ userId });
    if (existingProfile) {
      return res.status(400).json({
        success: false,
        message: 'User profile already exists'
      });
    }

    const userProfile = new UserProfile({
      ...req.body,
      userId,
      id: req.body.id || userId
    });

    await userProfile.save();

    res.status(201).json({
      success: true,
      message: 'User profile created successfully',
      data: userProfile
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'User profile already exists'
      });
    }
    console.error('Error creating user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/userprofile/all:
 *   get:
 *     summary: Get all user profiles (for networking suggestions)
 *     tags: [UserProfile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of profiles to return
 *       - in: query
 *         name: exclude
 *         schema:
 *           type: string
 *         description: User ID to exclude from results (typically current user)
 *     responses:
 *       200:
 *         description: User profiles retrieved successfully
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
 *                     $ref: '#/components/schemas/UserProfile'
 *       401:
 *         description: Unauthorized
 */
router.get('/all', verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const exclude = req.query.exclude;
    
    console.log('Fetching all user profiles, limit:', limit, 'exclude:', exclude);
    
    // Build query to exclude specific user if provided
    const query = exclude ? { userId: { $ne: exclude } } : {};
    
    const userProfiles = await UserProfile.find(query)
      .select('userId firstName lastName headline industry company location profilePictureUrl contactInfo')
      .limit(limit)
      .sort({ createdAt: -1 });
    
    // Get career agent counts for all users in one query
    const userIds = userProfiles.map(profile => profile.userId);
    const careerAgentCounts = await Connection.aggregate([
      {
        $match: {
          careerAgentId: { $in: userIds },
          connectionType: 'careerAgent',
          relationshipStatus: 'active'
        }
      },
      {
        $group: {
          _id: '$careerAgentId',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Create a map for quick lookup
    const countMap = {};
    careerAgentCounts.forEach(item => {
      countMap[item._id] = item.count;
    });
    
    // Transform the data to match the networking Connection interface
    const transformedProfiles = userProfiles.map(profile => ({
      id: profile._id.toString(), // Use MongoDB _id as the connection id
      userId: profile.userId,
      name: `${profile.firstName} ${profile.lastName}`,
      title: profile.headline || 'Professional',
      industry: profile.industry || 'Unknown',
      company: profile.company || 'Unknown',
      avatar: profile.profilePictureUrl || 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=100',
      mutualConnections: Math.floor(Math.random() * 20), // Random for now - could be calculated later
      careerAgentFor: countMap[profile.userId] || 0, // Actual count from Connection table
      status: 'none'
    }));

    res.json({
      success: true,
      data: transformedProfiles
    });
  } catch (error) {
    console.error('Error fetching all user profiles:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/userprofile/potentialcontact:
 *   get:
 *     summary: Get potential contacts (users with no career agent relationship with current user)
 *     tags: [UserProfile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of profiles to return
 *     responses:
 *       200:
 *         description: Potential contacts retrieved successfully
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
 *                     $ref: '#/components/schemas/UserProfile'
 *       401:
 *         description: Unauthorized
 */
router.get('/potentialcontact', verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const currentUserId = req.user.userId;

    // Check if requester has any active career agent connection
    const requesterCareerAgentConnection = await Connection.findOne({
      candidateId: currentUserId,
      connectionType: 'careerAgent',
      relationshipStatus: 'active'
    });

    const hasCareerAgent = !!requesterCareerAgentConnection;

    // 1. Get all candidateIds where current user is the career agent
    const candidatesWhereMeAsAgent = await Connection.find({
      careerAgentId: currentUserId,
      connectionType: 'careerAgent',
      relationshipStatus: { $nin: ['inactive', 'rejected'] }
    }).distinct('candidateId');
    
    console.log('Candidates where I am career agent:', candidatesWhereMeAsAgent);
    
    // 2. Get all careerAgentIds where current user is the candidate
    const agentsWhereMeAsCandidate = await Connection.find({
      candidateId: currentUserId,
      connectionType: 'careerAgent',
      relationshipStatus: { $nin: ['inactive', 'rejected'] }
    }).distinct('careerAgentId');
    
    console.log('Career agents where I am candidate:', agentsWhereMeAsCandidate);
    
    // 3. Get all recipientUserIds where current user is the requestor (friend connections)
    const recipientsWhereMeAsRequestor = await Connection.find({
      requestorUserId: currentUserId,
      connectionType: 'friend',
      relationshipStatus: { $nin: ['inactive', 'rejected'] }
    }).distinct('recipientUserId');
    
    console.log('Recipients where I am requestor:', recipientsWhereMeAsRequestor);
    
    // 4. Get all requestorUserIds where current user is the recipient (friend connections)
    const requestorsWhereMeAsRecipient = await Connection.find({
      recipientUserId: currentUserId,
      connectionType: 'friend',
      relationshipStatus: { $nin: ['inactive', 'rejected'] }
    }).distinct('requestorUserId');
    
    console.log('Requestors where I am recipient:', requestorsWhereMeAsRecipient);
    
    // 5. Combine all lists and add current user to exclusion list
    const excludeUserIds = [
      ...candidatesWhereMeAsAgent,
      ...agentsWhereMeAsCandidate,
      ...recipientsWhereMeAsRequestor,
      ...requestorsWhereMeAsRecipient,
      currentUserId
    ];
    
    console.log('Excluding user IDs:', excludeUserIds);
    
    // 6. Get all users NOT in the exclusion list
    const potentialContacts = await UserProfile.find({
      userId: { $nin: excludeUserIds }
    })
      .select('userId firstName lastName headline industry company location profilePictureUrl contactInfo')
      .limit(limit)
      .sort({ createdAt: -1 });
    
    console.log('Found potential contacts:', potentialContacts.length);
    
    // Get career agent counts for all potential contacts
    const potentialUserIds = potentialContacts.map(profile => profile.userId);
    const careerAgentCounts = await Connection.aggregate([
      {
        $match: {
          careerAgentId: { $in: potentialUserIds },
          connectionType: 'careerAgent',
          relationshipStatus: 'active'
        }
      },
      {
        $group: {
          _id: '$careerAgentId',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Create a map for quick lookup
    const countMap = {};
    careerAgentCounts.forEach(item => {
      countMap[item._id] = item.count;
    });
    
    // Transform the data to match the networking Connection interface
    const transformedProfiles = potentialContacts.map(profile => ({
      id: profile._id.toString(),
      userId: profile.userId,
      name: `${profile.firstName} ${profile.lastName}`,
      title: profile.headline || 'Professional',
      industry: profile.industry || 'Unknown',
      company: profile.company || 'Unknown',
      avatar: profile.profilePictureUrl || 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=100',
      mutualConnections: Math.floor(Math.random() * 20), // Random for now - could be calculated later
      careerAgentFor: countMap[profile.userId] || 0,
      status: 'none'
    }));

    res.json({
      success: true,
      data: transformedProfiles,
      meta: {
        total: transformedProfiles.length,
        excludedRelationships: excludeUserIds.length - 1, // -1 for current user
        limit: limit
      },
      hasCareerAgent // <-- add this field
    });
  } catch (error) {
    console.error('Error fetching potential contacts:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});


/**
 * @swagger
 * /api/userprofile/{userId}:
 *   put:
 *     summary: Update user profile
 *     tags: [UserProfile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserProfile'
 *     responses:
 *       200:
 *         description: User profile updated successfully
 *       404:
 *         description: User profile not found
 */
router.put('/:userId', verifyToken, validateUserProfile, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const paramUserID = req.params.userId;
    console.log('Updating user profile for userId:', paramUserID);
    const userProfile = await UserProfile.findOne({ userId:  paramUserID });
    if (!userProfile) {
      console.log('User profile not found for userId:', paramUserID);
      return res.status(404).json({
        success: false,
        message: 'Forbidden: Cannot modify other user’s profile'
      });
    }

    console.log('User contact email:', userProfile.contactInfo?.email);
    console.log('req.user.userId------------:', req.user.userId);
    // Check if user is updating their own profile or has admin rights
    // later this will be extended to allow Managers of the profile to edit
    if (req.user.userId !== userProfile.contactInfo?.email && req.user.role !== 'admin') {
      console.log('Unauthorized update attempt by user:', req.user.userId);
      return res.status(403).json({
        success: false,
        message: 'You can only update your own profile'
      });
    }

    const userProfileOfUpdate = await UserProfile.findOneAndUpdate(
      { userId: req.params.userId },
      { ...req.body },
      { new: true, runValidators: true }
    );

    console.log('User profile after update:', userProfileOfUpdate);

    if (!userProfileOfUpdate) {
      console.log('User profile not found for userId:', req.params.userId);
      return res.status(404).json({
        success: false,
        message: 'User profile not found'
      });
    }

    console.log('User profile updated successfully:', userProfile);

    res.json({
      success: true,
      message: 'User profile updated successfully',
      data: userProfileOfUpdate
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/userprofile/{userId}:
 *   delete:
 *     summary: Delete user profile
 *     tags: [UserProfile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User profile deleted successfully
 *       404:
 *         description: User profile not found
 */
router.delete('/:userId', verifyToken, async (req, res) => {
  try {
    // Check if user is deleting their own profile or has admin rights
    if (req.user.userId !== req.params.userId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own profile'
      });
    }

    const userProfile = await UserProfile.findOneAndDelete({ userId: req.params.userId });

    if (!userProfile) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found'
      });
    }

    res.json({
      success: true,
      message: 'User profile deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/userprofile/upload-photo:
 *   post:
 *     summary: Upload user profile photo to S3
 *     tags: [UserProfile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *               userId:
 *                 type: string
 *               photoType:
 *                 type: string
 *                 enum: [profile, background]
 *                 default: profile
 *     responses:
 *       200:
 *         description: Photo uploaded successfully
 *       400:
 *         description: Invalid file or upload error
 *       404:
 *         description: User profile not found
 */
router.post('/upload-photo', verifyToken, upload.single('photo'), async (req, res) => {
  try {
    console.log('Uploading photo with data:', req.body);
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No photo file provided'
      });
    }
    
    const userId = req.body.userId || req.user.userId;
    console.log('User ID for photo upload:', userId);
    const photoType = req.body.photoType || 'profile'; // 'profile' or 'background'
    
    // Check if user profile exists
    const userProfile = await UserProfile.findOne({ userId: userId });
    if (!userProfile) {
      console.log('User profile not found for userId:', userId);
      return res.status(404).json({
        success: false,
        message: 'User profile not found. Please create a profile first.'
      });
    }

    const fileExtension = req.file.originalname.split('.').pop();
    console.log('File extension:', fileExtension);
    const fileName = `${photoType}-photos/${userId}/${photoType}-photo.${fileExtension}`;

    console.log('File name for S3 upload:', fileName);

    // Upload to S3
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    };

    console.log('S3 upload parameters:', uploadParams);
    const uploadResult = await s3.upload(uploadParams).promise();

    console.log('S3 upload result:', uploadResult);
    // Update user profile with S3 key (not full URL)
    const updateField = photoType === 'background' ? 'backgroundPictureUrl' : 'profilePictureUrl';
    userProfile[updateField] = process.env.CLOUDFRONT_MEDIA_DOMAIN_NAME + "/" + fileName;

    console.log(`Updating user profile with ${photoType} photo URL:`, userProfile[updateField]);
    await userProfile.save();
    console.log('User profile updated with photo URL:', userProfile[updateField]);
    console.log('Photo upload successful:', uploadResult.Location);
    // Generate CloudFront signed URL
    //const signedUrl = await generateSignedUrl(fileName);
    const url = await getUrl(fileName);
    console.log('Generated photo URL:', url);
    
    res.json({
      success: true,
      message: `${photoType} photo uploaded successfully`,
      photoUrl: url,
      photoType
    });

  } catch (error) {
    console.error('Error uploading photo:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload photo'
    });
  }
});

/**
 * @swagger
 * /api/userprofile/{userId}/delete-photo:
 *   delete:
 *     summary: Delete user profile photo
 *     tags: [UserProfile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: photoType
 *         schema:
 *           type: string
 *           enum: [profile, background]
 *           default: profile
 *     responses:
 *       200:
 *         description: Photo deleted successfully
 *       404:
 *         description: User profile not found
 */
router.delete('/:userId/delete-photo', verifyToken, async (req, res) => {
  try {
    // Check if user is deleting their own photo
    if (req.user.userId !== req.params.userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own photo'
      });
    }

    const photoType = req.query.photoType || 'profile';
    const userProfile = await UserProfile.findOne({ userId: req.params.userId });
    
    if (!userProfile) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found'
      });
    }

    const photoField = photoType === 'background' ? 'backgroundPictureUrl' : 'profilePictureUrl';
    const photoUrl = userProfile[photoField];

    if (!photoUrl) {
      return res.status(404).json({
        success: false,
        message: `No ${photoType} photo found`
      });
    }

    // Extract S3 key from URL
    const urlParts = photoUrl.split('/');
    const s3Key = urlParts.slice(-3).join('/'); // Get the last 3 parts

    // Delete from S3
    const deleteParams = {
      Bucket: BUCKET_NAME,
      Key: s3Key
    };

    await s3.deleteObject(deleteParams).promise();

    // Update user profile to remove photo URL
    userProfile[photoField] = null;
    await userProfile.save();

    res.json({
      success: true,
      message: `${photoType} photo deleted successfully`
    });

  } catch (error) {
    console.error('Error deleting photo:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete photo'
    });
  }
});

/**
 * @swagger
 * /api/userprofile/{userId}/experience:
 *   post:
 *     summary: Add experience to user profile
 *     tags: [UserProfile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
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
 *               title:
 *                 type: string
 *               company:
 *                 type: string
 *               location:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               current:
 *                 type: boolean
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Experience added successfully
 *       404:
 *         description: User profile not found
 */
router.post('/:userId/experience', verifyToken, async (req, res) => {
  try {
    if (req.user.userId !== req.params.userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own profile'
      });
    }

    const userProfile = await UserProfile.findOne({ userId: req.params.userId });
    if (!userProfile) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found'
      });
    }

    userProfile.experience.push(req.body);
    await userProfile.save();

    res.json({
      success: true,
      message: 'Experience added successfully',
      data: userProfile
    });
  } catch (error) {
    console.error('Error adding experience:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/userprofile/{userId}/education:
 *   post:
 *     summary: Add education to user profile
 *     tags: [UserProfile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
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
 *               school:
 *                 type: string
 *               degree:
 *                 type: string
 *               fieldOfStudy:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Education added successfully
 *       404:
 *         description: User profile not found
 */
router.post('/:userId/education', verifyToken, async (req, res) => {
  try {
    if (req.user.userId !== req.params.userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own profile'
      });
    }

    const userProfile = await UserProfile.findOne({ userId: req.params.userId });
    if (!userProfile) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found'
      });
    }

    userProfile.education.push(req.body);
    await userProfile.save();

    res.json({
      success: true,
      message: 'Education added successfully',
      data: userProfile
    });
  } catch (error) {
    console.error('Error adding education:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/userprofile/search:
 *   get:
 *     summary: Search user profiles by name (first or last name, with suggestions)
 *     tags: [UserProfile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Name to search for (first or last name)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Maximum number of profiles to return
 *     responses:
 *       200:
 *         description: User profiles matching the search
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
 *                     $ref: '#/components/schemas/UserProfile'
 *                 suggestions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/UserProfile'
 *       400:
 *         description: Missing or invalid search parameter
 *       401:
 *         description: Unauthorized
 */
router.get('/search', verifyToken, async (req, res) => {
  console.log('ANY REQUEST TO /api/userprofile/search');
  try {
    const { name } = req.query;
    const limit = parseInt(req.query.limit) || 10;
    console.log(`[UserProfile Search] Query params: name="${name}", limit=${limit}, user=${req.user?.userId}`);

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      console.log('[UserProfile Search] Missing or invalid name parameter');
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid name parameter'
      });
    }

    // 1. Try exact (case-insensitive) and partial match using regex
    const regex = new RegExp(name.trim(), 'i');
    console.log(`[UserProfile Search] Searching for direct matches with regex: ${regex}`);
    let matches = await UserProfile.find({
      $or: [
        { firstName: regex },
        { lastName: regex }
      ]
    })
      .limit(limit)
      .select('userId firstName lastName headline industry company location profilePictureUrl contactInfo');
    console.log(`[UserProfile Search] Direct matches found: ${matches.length}`);
    console.log('Matches:', matches);

    // 2. If no matches, use fuzzy search for suggestions (Levenshtein distance)
    let suggestions = [];
    if (matches.length === 0) {
      console.log('[UserProfile Search] No direct matches, running fuzzy search for suggestions');
      // Fetch a larger pool for fuzzy matching
      const allProfiles = await UserProfile.find({})
        .select('userId firstName lastName headline industry company location profilePictureUrl contactInfo')
        .limit(100);
      console.log(`[UserProfile Search] Fuzzy pool size: ${allProfiles.length}`);

      // Simple Levenshtein distance implementation
      function levenshtein(a, b) {
        if (!a.length) return b.length;
        if (!b.length) return a.length;
        const matrix = Array.from({ length: a.length + 1 }, () =>
          Array(b.length + 1).fill(0)
        );
        for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
        for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= a.length; i++) {
          for (let j = 1; j <= b.length; j++) {
            matrix[i][j] = a[i - 1] === b[j - 1]
              ? matrix[i - 1][j - 1]
              : Math.min(
                  matrix[i - 1][j - 1] + 1, // substitution
                  matrix[i][j - 1] + 1,     // insertion
                  matrix[i - 1][j] + 1      // deletion
                );
          }
        }
        return matrix[a.length][b.length];
      }

      // Compute distance for each profile and sort by closest match
      suggestions = allProfiles
        .map(profile => {
          const firstDist = levenshtein(name.toLowerCase(), (profile.firstName || '').toLowerCase());
          const lastDist = levenshtein(name.toLowerCase(), (profile.lastName || '').toLowerCase());
          return {
            profile,
            distance: Math.min(firstDist, lastDist)
          };
        })
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit)
        .map(item => item.profile);

      console.log(`[UserProfile Search] Suggestions found: ${suggestions.length}`);
    }

    console.log('[UserProfile Search] --- Success ---');
    res.json({
      success: true,
      data: matches,
      suggestions: matches.length === 0 ? suggestions : []
    });
  } catch (error) {
    console.error('[UserProfile Search] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});



/**
 * @swagger
 * /api/userprofile/{userId}:
 *   get:
 *     summary: Get user profile by ID
 *     tags: [UserProfile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 *       404:
 *         description: User profile not found
 */
router.get('/:userId', verifyToken, async (req, res) => {
  try {
    console.log('Fetching user profile for userId:', req.params.userId);
    const userProfile = await UserProfile.findOne({ userId: req.params.userId });
    
    if (!userProfile) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found'
      });
    }

    res.json({
      success: true,
      data: userProfile
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/userprofile/basic-info:
 *   post:
 *     summary: Get basic profile info (first name, last name, email, headline) for a list of userIds
 *     tags: [UserProfile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of userIds to fetch
 *     responses:
 *       200:
 *         description: Profiles found
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
 *                     type: object
 *                     properties:
 *                       userId:
 *                         type: string
 *                       firstName:
 *                         type: string
 *                       lastName:
 *                         type: string
 *                       email:
 *                         type: string
 *                       headline:
 *                         type: string
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 */
router.post('/basic-info', verifyToken, async (req, res) => {
  try {
    const requesterUserId = req.user.userId;
    const { userIds } = req.body;
    userIds.push(requesterUserId); // Ensure requester's own profile is included
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'userIds must be a non-empty array'
      });
    }

    const profiles = await UserProfile.find({ userId: { $in: userIds } })
      .select('userId firstName lastName headline contactInfo.email')
      .lean();

    const result = profiles.map(profile => ({
      userId: profile.userId,
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.contactInfo?.email || null,
      headline: profile.headline || ''
    }));

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error in /basic-info user profile lookup:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;