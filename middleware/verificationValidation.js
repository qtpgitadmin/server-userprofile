import { body, validationResult } from 'express-validator';
import axios from 'axios';

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

// Helper function to check career agent relationship
const checkCareerAgentRelationship = async (forUserId, authorizationHeader) => {
  const apiUrl = `${process.env.CONNECTIONS_API_URL || 'http://localhost:5000'}/api/connections/careeragent/relationship`;
  const response = await axios.get(apiUrl, {
    params: { forUserId },
    headers: { Authorization: authorizationHeader }
  });
  return response.data;
};

// Middleware to verify cover letter access
const verifyCoverLetterAccess = async (req, res, next) => {
  try {
    let fromUserId, forUserId;

    // For POST and PUT, get from body; for GET/DELETE, get from DB
    if (req.method === 'POST' || req.method === 'PUT') {
      fromUserId = req.body.fromUserId;
      forUserId = req.body.forUserId;
    } else if (req.method === 'GET' && req.params.userId) {
      fromUserId = req.params.userId;
      forUserId = req.params.userId;
    } 

    // Check if requester is fromUserId
    if (req.user.userId !== fromUserId) {
      return res.status(403).json({ success: false, error: 'Forbidden: Not the owner or career agent' });
    }

    // Allow if fromUserId === forUserId
    if (fromUserId === forUserId) {
      return next();
    }

    // Otherwise, check career agent relationship
    const relationship = await checkCareerAgentRelationship(forUserId, req.headers.authorization);
    if (relationship && relationship.isCareerAgent) {
      return next();
    } else {
      return res.status(403).json({ success: false, error: 'Forbidden: Not a career agent' });
    }
  } catch (err) {
    return res.status(403).json({ success: false, error: 'Forbidden: ' + (err.response?.data?.error || err.message) });
  }
};

export default verifyCoverLetterAccess;