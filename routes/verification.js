import express from 'express';
import { body, validationResult } from 'express-validator';
import Verification from '../models/Verification.js';
import emailService from '../services/emailService.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

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

// Generate 6-digit random verification code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Validation middleware for sending verification code
const validateSendVerification = [
  body('userId')
    .trim()
    .isLength({ min: 1 })
    .withMessage('User ID is required'),
  
  body('recipientEmail')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid recipient email is required'),

  // Middleware to check validation results
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed: ' + errors.array().map(err => err.msg).join(', '),
        errors: errors.array()
      });
    }
    next();
  }
];

// Validation middleware for verifying code
const validateVerifyCode = [
  body('verificationId')
    .trim()
    .isLength({ min: 1 })
    .withMessage('Verification ID is required'),
  
  body('code')
    .trim()
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('Verification code must be exactly 6 digits'),

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
 *     SendVerificationRequest:
 *       type: object
 *       required:
 *         - userId
 *         - recipientEmail
 *       properties:
 *         userId:
 *           type: string
 *           description: User ID of the person requesting verification
 *         recipientEmail:
 *           type: string
 *           format: email
 *           description: Email where verification code will be sent
 *     VerifyCodeRequest:
 *       type: object
 *       required:
 *         - verificationId
 *         - code
 *       properties:
 *         verificationId:
 *           type: string
 *           description: Unique verification ID
 *         code:
 *           type: string
 *           description: 6-digit verification code
 */

/**
 * @swagger
 * /api/verification/send-code:
 *   post:
 *     summary: Send verification code
 *     tags: [Verification]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SendVerificationRequest'
 *     responses:
 *       201:
 *         description: Verification code sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 verificationId:
 *                   type: string
 *       400:
 *         description: Validation error
 *       500:
 *         description: Internal server error
 */
router.post('/send-code', verifyToken, validateSendVerification, async (req, res) => {
  try {
    console.log('Received request to send verification code:', req.body);
    const { userId, recipientEmail } = req.body;

    console.log(`Received request to send verification code to ${recipientEmail} for user ${userId}`);  
    // Generate 6-digit verification code
    const verificationCode = generateVerificationCode();

    // Create verification record
    const verification = new Verification({
      userId: userId.trim(),
      recipientEmail: recipientEmail.toLowerCase().trim(),
      verificationCode,
      metadata: {
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        requestTime: new Date()
      }
    });
    console.log(`Creating verification record for user ${userId} with email ${recipientEmail}`);  

    // Save to MongoDB
    await verification.save();

    console.log(`Verification record created with ID: ${verification.verificationId}`);

    console.log(`Sending verification code ${verificationCode} to ${recipientEmail}`);
    // Send verification email using AWS SES
    try {
      const emailResult = await emailService.sendVerificationCode(
        recipientEmail,
        verificationCode,
        userId
      );

      if (!emailResult.success) {
        console.error('Failed to send verification email:', emailResult.error);
        // Don't fail the request if email fails, but log it
      } else {
        console.log('Verification email sent successfully');
      }
    } catch (emailError) {
      console.error('Error sending verification email:', emailError);
      // Continue with the response even if email fails
    }

    // Respond with verificationId
    res.status(201).json({
      success: true,
      message: 'Verification code sent successfully',
      verificationId: verification.verificationId
    });

  } catch (error) {
    console.error('Error in send verification:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/verification/verify:
 *   put:
 *     summary: Verify code
 *     tags: [Verification]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerifyCodeRequest'
 *     responses:
 *       200:
 *         description: Code verified successfully
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
 *                   type: object
 *       400:
 *         description: Invalid code or verification expired
 *       404:
 *         description: Verification record not found
 *       500:
 *         description: Internal server error
 */
router.put('/verify-code', verifyToken, validateVerifyCode, async (req, res) => {
  try {
    console.log('Received request to verify code:', req.body);
    const { verificationId, code } = req.body;

    // Find verification record by verificationId
    const verification = await Verification.findOne({ verificationId: verificationId });

    if (!verification) {
      return res.status(404).json({
        success: false,
        message: 'Verification record not found'
      });
    }

    // Check if already verified
    if (verification.status === 'verified') {
      return res.status(400).json({
        success: false,
        message: 'This verification has already been completed'
      });
    }

    // Check if expired
    if (verification.status === 'expired' || verification.expiresAt < new Date()) {
      verification.status = 'expired';
      await verification.save();
      
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired. Please request a new one.'
      });
    }

    // Check attempts limit
    if (verification.attempts >= 3) {
      verification.status = 'expired';
      await verification.save();
      
      return res.status(400).json({
        success: false,
        message: 'Maximum verification attempts exceeded. Please request a new verification.'
      });
    }

    // Increment attempts
    verification.attempts += 1;

    // Compare the code
    if (verification.verificationCode !== code.trim()) {
      await verification.save();
      
      const remainingAttempts = 3 - verification.attempts;
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code',
        remainingAttempts
      });
    }

    // Code is correct - update status
    verification.status = 'verified';
    verification.verifiedAt = new Date();
    await verification.save();

    console.log(`Verification ${verificationId} completed successfully`);

    res.json({
      success: true,
      message: 'Code verified successfully',
      data: {
        verificationId: verification.verificationId,
        userId: verification.userId,
        recipientEmail: verification.recipientEmail,
        status: verification.status,
        verifiedAt: verification.verifiedAt
      }
    });

  } catch (error) {
    console.error('Error in verify code:', error);
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/verification/{verificationId}:
 *   get:
 *     summary: Get verification status
 *     tags: [Verification]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: verificationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Verification status retrieved successfully
 *       404:
 *         description: Verification record not found
 */
router.get('/:verificationId', verifyToken, async (req, res) => {
  try {
    const verification = await Verification.findOne({ 
      verificationId: req.params.verificationId 
    }).select('-verificationCode'); // Don't return the actual code

    if (!verification) {
      return res.status(404).json({
        success: false,
        message: 'Verification record not found'
      });
    }

    res.json({
      success: true,
      data: verification
    });

  } catch (error) {
    console.error('Error getting verification status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;