import { body, validationResult } from 'express-validator';

// Validation middleware for verification request
export const validateVerificationRequest = [
  body('userId')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('User ID is required and must be less than 100 characters'),
  
  body('companyName')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Company name is required and must be less than 100 characters'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  
  body('requestedBy')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Requested by field must be less than 50 characters'),

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

// Validation middleware for verification code
export const validateVerificationCode = [
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