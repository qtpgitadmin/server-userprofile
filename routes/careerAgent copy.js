import express from 'express';
import { body, validationResult } from 'express-validator';
import CareerAgent from '../models/CareerAgent.js';
import UserProfile from '../models/UserProfile.js';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

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

// Validation for creating career agent relationship
const validateCareerAgentRelationship = [
  body('careerAgentId').trim().isLength({ min: 1 }).withMessage('Career Agent ID is required'),
  body('candidateId').trim().isLength({ min: 1 }).withMessage('Candidate ID is required'),
  body('message').optional().trim().isLength({ max: 1000 }).withMessage('message must be less than 1000 characters'),
  body('relationshipStatus').optional().isIn(['active', 'inactive', 'pending', 'proposed','requested','rejected']).withMessage('Invalid relationship status')
];

/**
 * @swagger
 * components:
 *   schemas:
 *     CareerAgent:
 *       type: object
 *       required:
 *         - careerAgentId
 *         - candidateId
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the relationship
 *         careerAgentId:
 *           type: string
 *           description: User ID of the career agent
 *         candidateId:
 *           type: string
 *           description: User ID of the candidate (unique)
 *         relationshipStatus:
 *           type: string
 *           enum: [active, inactive, pending, proposed, requested, rejected]
 *           default: active
 *         startDate:
 *           type: string
 *           format: date-time
 *           description: When the relationship started
 *         endDate:
 *           type: string
 *           format: date-time
 *           description: When the relationship ended (if applicable)
 *         message:
 *           type: string
 *           description: Additional message about the relationship
 */

/**
 * @swagger
 * /api/careeragent:
 *   post:
 *     summary: Create a career agent relationship
 *     tags: [CareerAgent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - careerAgentId
 *               - candidateId
 *             properties:
 *               careerAgentId:
 *                 type: string
 *                 description: User ID of the career agent
 *               candidateId:
 *                 type: string
 *                 description: User ID of the candidate
 *               message:
 *                 type: string
 *                 description: Additional message about the relationship
 *               relationshipStatus:
 *                 type: string
 *                 enum: [active, inactive, pending, proposed, requested, rejected]
 *                 default: active
 *     responses:
 *       201:
 *         description: Career agent relationship created successfully
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
 *                   $ref: '#/components/schemas/CareerAgent'
 *       400:
 *         description: Validation error or candidate already has a career agent
 *       404:
 *         description: Career agent or candidate profile not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/', verifyToken, validateCareerAgentRelationship, async (req, res) => {
  try {
    console.log('Creating career agent relationship with data:', req.body);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { careerAgentId, candidateId, message, relationshipStatus } = req.body;

    // Validate that careerAgentId and candidateId are different
    if (careerAgentId === candidateId) {
      return res.status(400).json({
        success: false,
        message: 'Career agent and candidate cannot be the same person'
      });
    }

    // Check if career agent profile exists
    const careerAgentProfile = await UserProfile.findOne({ userId: careerAgentId });
    if (!careerAgentProfile) {
      return res.status(404).json({
        success: false,
        message: 'Career agent profile not found'
      });
    }

    // Check if candidate profile exists
    const candidateProfile = await UserProfile.findOne({ userId: candidateId });
    if (!candidateProfile) {
      return res.status(404).json({
        success: false,
        message: 'Candidate profile not found'
      });
    }

    // Check if candidate already has an active career agent
    const existingActiveRelationship = await CareerAgent.findOne({ 
      candidateId: candidateId,
      relationshipStatus: 'active'
    });
    
    if (existingActiveRelationship) {
      return res.status(400).json({
        success: false,
        message: 'Candidate already has an active career agent relationship',
        existingCareerAgentId: existingActiveRelationship.careerAgentId
      });
    }

    // Check if there's already a pending or proposed request between these users
    const existingPendingRelationship = await CareerAgent.findOne({ 
      careerAgentId: careerAgentId,
      candidateId: candidateId,
      relationshipStatus: { $in: ['pending', 'proposed'] }
    });
    
    if (existingPendingRelationship) {
      return res.status(400).json({
        success: false,
        message: `A ${existingPendingRelationship.relationshipStatus} request already exists between these users`,
        existingRelationshipId: existingPendingRelationship._id
      });
    }

    // Create new career agent relationship
    const careerAgentRelationship = new CareerAgent({
      careerAgentId,
      candidateId,
      message: message || '',
      relationshipStatus: relationshipStatus || 'active'
    });

    console.log('New career agent relationship data:', careerAgentRelationship);
    await careerAgentRelationship.save();
    
    // Populate the relationship with user details
    await careerAgentRelationship.populate(['careerAgent', 'candidate']);
    
    console.log('Career agent relationship created successfully:', careerAgentRelationship);
    res.status(201).json({
      success: true,
      message: 'Career agent relationship created successfully',
      data: careerAgentRelationship
    });
  } catch (error) {
    console.log('Error creating career agent relationship:', error);
    if (error.code === 11000) {
      // Handle duplicate key error (candidate already has a career agent)
      return res.status(400).json({
        success: false,
        message: 'This candidate already has a career agent assigned'
      });
    }
    console.error('Error creating career agent relationship:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/careeragent/request:
 *   post:
 *     summary: Request someone to be your career agent
 *     tags: [CareerAgent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - careerAgentId
 *             properties:
 *               careerAgentId:
 *                 type: string
 *                 description: User ID of the requested career agent
 *               message:
 *                 type: string
 *                 description: Optional message with the request
 *     responses:
 *       201:
 *         description: Career agent request sent successfully
 *       400:
 *         description: Validation error or request already exists
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/request', verifyToken, async (req, res) => {
  try {
    const { careerAgentId, message } = req.body;
    const candidateId = req.user.userId; // Current user is the candidate

    console.log(`User ${candidateId} requesting ${careerAgentId} as career agent`);

    // Validate that user is not requesting themselves
    if (careerAgentId === candidateId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot request yourself as a career agent'
      });
    }

    // Check if requested career agent profile exists
    const careerAgentProfile = await UserProfile.findOne({ userId: careerAgentId });
    if (!careerAgentProfile) {
      return res.status(404).json({
        success: false,
        message: 'Requested career agent profile not found'
      });
    }

    // Check if candidate already has an active career agent
    const existingActiveRelationship = await CareerAgent.findOne({ 
      candidateId: candidateId,
      relationshipStatus: 'active'
    });
    
    if (existingActiveRelationship) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active career agent',
        existingCareerAgentId: existingActiveRelationship.careerAgentId
      });
    }

    // Check if there's already a pending request to this career agent
    const existingPendingRequest = await CareerAgent.findOne({ 
      careerAgentId: careerAgentId,
      candidateId: candidateId,
      relationshipStatus: 'pending'
    });
    
    if (existingPendingRequest) {
      return res.status(400).json({
        success: false,
        message: 'You already have a pending request to this career agent',
        existingRequestId: existingPendingRequest._id
      });
    }

    // Create new career agent request
    const careerAgentRequest = new CareerAgent({
      careerAgentId,
      candidateId,
      message: message || `${req.user.firstName || 'User'} has requested you to be their career agent`,
      relationshipStatus: 'pending'
    });

    await careerAgentRequest.save();
    
    // Populate the relationship with user details
    await careerAgentRequest.populate(['careerAgent', 'candidate']);
    
    console.log('Career agent request created successfully:', careerAgentRequest);
    res.status(201).json({
      success: true,
      message: 'Career agent request sent successfully',
      data: careerAgentRequest
    });
  } catch (error) {
    console.error('Error creating career agent request:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/careeragent/propose:
 *   post:
 *     summary: Propose yourself as a career agent to a candidate
 *     tags: [CareerAgent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - candidateId
 *             properties:
 *               candidateId:
 *                 type: string
 *                 description: User ID of the candidate you want to mentor
 *               message:
 *                 type: string
 *                 description: Optional message with your proposal
 *     responses:
 *       201:
 *         description: Career agent proposal sent successfully
 *       400:
 *         description: Validation error or proposal already exists
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/propose', verifyToken, async (req, res) => {
  try {
    const { candidateId, message } = req.body;
    const careerAgentId = req.user.userId; // Current user is proposing to be the career agent

    console.log(`User ${careerAgentId} proposing to be career agent for ${candidateId}`);

    // Validate that user is not proposing to themselves
    if (careerAgentId === candidateId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot propose yourself as your own career agent'
      });
    }

    // Check if candidate profile exists
    const candidateProfile = await UserProfile.findOne({ userId: candidateId });
    if (!candidateProfile) {
      return res.status(404).json({
        success: false,
        message: 'Candidate profile not found'
      });
    }

    // Check if candidate already has an active career agent
    const existingActiveRelationship = await CareerAgent.findOne({ 
      candidateId: candidateId,
      relationshipStatus: 'active'
    });
    
    if (existingActiveRelationship) {
      return res.status(400).json({
        success: false,
        message: 'This candidate already has an active career agent',
        existingCareerAgentId: existingActiveRelationship.careerAgentId
      });
    }

    // Check if there's already a pending or proposed relationship between these users
    const existingRelationship = await CareerAgent.findOne({ 
      careerAgentId: careerAgentId,
      candidateId: candidateId,
      relationshipStatus: { $in: ['pending', 'proposed'] }
    });
    
    if (existingRelationship) {
      return res.status(400).json({
        success: false,
        message: `A ${existingRelationship.relationshipStatus} relationship already exists between you and this candidate`,
        existingRelationshipId: existingRelationship._id
      });
    }

    // Create new career agent proposal
    const careerAgentProposal = new CareerAgent({
      careerAgentId,
      candidateId,
      message: message || `${req.user.firstName || 'A career agent'} has proposed to mentor you`,
      relationshipStatus: 'proposed'
    });

    await careerAgentProposal.save();
    
    // Populate the relationship with user details
    await careerAgentProposal.populate(['careerAgent', 'candidate']);
    
    console.log('Career agent proposal created successfully:', careerAgentProposal);
    res.status(201).json({
      success: true,
      message: 'Career agent proposal sent successfully',
      data: careerAgentProposal
    });
  } catch (error) {
    console.error('Error creating career agent proposal:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/careeragent/requests/received:
 *   get:
 *     summary: Get all pending requests received (for career agents)
 *     tags: [CareerAgent]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of requests to return
 *     responses:
 *       200:
 *         description: Requests retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/requests/received', verifyToken, async (req, res) => {
  try {
    const careerAgentId = req.user.userId;
    const { limit = 50 } = req.query;
    
    console.log('Fetching pending requests for career agent:', careerAgentId);
    
    const pendingRequests = await CareerAgent.find({
      careerAgentId: careerAgentId,
      relationshipStatus: 'pending'
    })
    .populate('candidate', 'firstName lastName headline industry location profilePictureUrl')
    .limit(parseInt(limit))
    .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: pendingRequests,
      count: pendingRequests.length
    });
  } catch (error) {
    console.error('Error fetching pending requests:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/careeragent/requests/sent:
 *   get:
 *     summary: Get all requests sent by current user
 *     tags: [CareerAgent]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of requests to return
 *     responses:
 *       200:
 *         description: Requests retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/requests/sent', verifyToken, async (req, res) => {
  try {
    const candidateId = req.user.userId;
    const { limit = 50 } = req.query;
    
    console.log('Fetching requests sent by candidate:', candidateId);
    
    const sentRequests = await CareerAgent.find({
      candidateId: candidateId,
      relationshipStatus: 'pending'
    })
    .populate('careerAgent', 'firstName lastName headline industry location profilePictureUrl')
    .limit(parseInt(limit))
    .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: sentRequests,
      count: sentRequests.length
    });
  } catch (error) {
    console.error('Error fetching sent requests:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/careeragent/proposals/received:
 *   get:
 *     summary: Get all proposals received (for candidates)
 *     tags: [CareerAgent]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of proposals to return
 *     responses:
 *       200:
 *         description: Proposals retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/proposals/received', verifyToken, async (req, res) => {
  try {
    const candidateId = req.user.userId;
    const { limit = 50 } = req.query;
    console.log('Fetching proposals received by candidate:', candidateId);
    

    
    const proposalsReceived = await CareerAgent.find({
      candidateId: candidateId,
      relationshipStatus: 'proposed'
    })
    .populate('careerAgent', 'firstName lastName headline industry location profilePictureUrl')
    .limit(parseInt(limit))
    .sort({ createdAt: -1 });

    console.log('Proposals received:', proposalsReceived);
    
    res.json({
      success: true,
      data: proposalsReceived,
      count: proposalsReceived.length
    });
  } catch (error) {
    console.error('Error fetching proposals received:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/careeragent/proposals/sent:
 *   get:
 *     summary: Get all proposals sent by current user (as career agent)
 *     tags: [CareerAgent]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of proposals to return
 *     responses:
 *       200:
 *         description: Proposals retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/proposals/sent', verifyToken, async (req, res) => {
  try {
    const careerAgentId = req.user.userId;
    const { limit = 50 } = req.query;
    
    console.log('Fetching proposals sent by career agent:', careerAgentId);
    
    const proposalsSent = await CareerAgent.find({
      careerAgentId: careerAgentId,
      relationshipStatus: 'proposed'
    })
    .populate('candidate', 'firstName lastName headline industry location profilePictureUrl')
    .limit(parseInt(limit))
    .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: proposalsSent,
      count: proposalsSent.length
    });
  } catch (error) {
    console.error('Error fetching proposals sent:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/careeragent/connected:
 *   get:
 *     summary: Get all career agent relationships for current user (as either candidate or career agent)
 *     tags: [CareerAgent]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of relationships to return
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, pending, proposed, requested, rejected]
 *         description: Filter by relationship status
 *     responses:
 *       200:
 *         description: Connected relationships retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/connected', verifyToken, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const { limit = 50, status } = req.query;
    
    console.log('Fetching connected relationships for user:', currentUserId);
    
    // Build query to find relationships where user is either candidate or career agent
    const query = {
      $or: [
        { candidateId: currentUserId },
        { careerAgentId: currentUserId }
      ]
    };
    
    // Add status filter if provided
    if (status) {
      query.relationshipStatus = status;
    }
    
    const connectedRelationships = await CareerAgent.find(query)
      .populate('candidate', 'firstName lastName headline industry location profilePictureUrl')
      .populate('careerAgent', 'firstName lastName headline industry location profilePictureUrl')
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
    
    console.log('Found connected relationships:', connectedRelationships.length);
    
    res.json({
      success: true,
      data: connectedRelationships,
      count: connectedRelationships.length
    });
  } catch (error) {
    console.error('Error fetching connected relationships:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/careeragent/{relationshipId}/accept:
 *   put:
 *     summary: Accept a career agent request
 *     tags: [CareerAgent]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: relationshipId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the request to accept
 *     responses:
 *       200:
 *         description: Request accepted successfully
 *       404:
 *         description: Request not found
 *       403:
 *         description: Not authorized to accept this request
 *       401:
 *         description: Unauthorized
 */
router.put('/:relationshipId/accept', verifyToken, async (req, res) => {
  try {
    const { relationshipId } = req.params;
    const careerAgentId = req.user.userId;
    
    console.log('Accepting career agent request:', relationshipId);
    
    // Find the pending/proposed request and verify authorization
    const relationship = await CareerAgent.findOne({ 
      _id: relationshipId,
      relationshipStatus: { $in: ['pending', 'proposed'] }
    });
    
    if (!relationship) {
      return res.status(404).json({
        success: false,
        message: 'Pending or proposed request not found'
      });
    }

    // Check authorization based on request type
    const userId = req.user.userId;
    let isAuthorized = false;
    
    if (relationship.relationshipStatus === 'pending') {
      // For pending requests (candidate requested agent), only the career agent can accept
      isAuthorized = relationship.careerAgentId === userId;
    } else if (relationship.relationshipStatus === 'proposed') {
      // For proposed requests (agent proposed to candidate), only the candidate can accept
      isAuthorized = relationship.candidateId === userId;
    }
    
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to accept this request'
      });
    }

    // Update the relationship to active
    relationship.relationshipStatus = 'active';
    relationship.startDate = new Date();
    await relationship.save();
    
    // Populate the relationship with user details
    await relationship.populate(['careerAgent', 'candidate']);
    
    res.json({
      success: true,
      message: `Career agent ${relationship.relationshipStatus === 'pending' ? 'request' : 'proposal'} accepted successfully`,
      data: relationship
    });
  } catch (error) {
    console.error('Error accepting career agent request:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/careeragent/{relationshipId}/reject:
 *   put:
 *     summary: Reject a career agent request
 *     tags: [CareerAgent]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: relationshipId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the request to reject
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: Optional reason for rejection
 *     responses:
 *       200:
 *         description: Request rejected successfully
 *       404:
 *         description: Request not found
 *       403:
 *         description: Not authorized to reject this request
 *       401:
 *         description: Unauthorized
 */
router.put('/:relationshipId/reject', verifyToken, async (req, res) => {
  try {
    const { relationshipId } = req.params;
    const { message } = req.body;
    const careerAgentId = req.user.userId;
    
    console.log('Rejecting career agent request:', relationshipId);
    
    // Find the pending/proposed request and verify authorization
    const relationship = await CareerAgent.findOne({ 
      _id: relationshipId,
      relationshipStatus: { $in: ['pending', 'proposed'] }
    });
    
    if (!relationship) {
      return res.status(404).json({
        success: false,
        message: 'Pending or proposed request not found'
      });
    }

    // Check authorization based on request type
    const userId = req.user.userId;
    let isAuthorized = false;
    
    if (relationship.relationshipStatus === 'pending') {
      // For pending requests (candidate requested agent), only the career agent can reject
      isAuthorized = relationship.careerAgentId === userId;
    } else if (relationship.relationshipStatus === 'proposed') {
      // For proposed requests (agent proposed to candidate), only the candidate can reject
      isAuthorized = relationship.candidateId === userId;
    }
    
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to reject this request'
      });
    }

    // Update the relationship to inactive (rejected)
    relationship.relationshipStatus = 'inactive';
    relationship.endDate = new Date();
    if (message) {
      relationship.message = message;
    }
    await relationship.save();
    
    // Populate the relationship with user details
    await relationship.populate(['careerAgent', 'candidate']);
    
    res.json({
      success: true,
      message: `Career agent ${relationship.relationshipStatus === 'pending' ? 'request' : 'proposal'} rejected successfully`,
      data: relationship
    });
  } catch (error) {
    console.error('Error rejecting career agent request:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/careeragent/agent/{careerAgentId}:
 *   get:
 *     summary: Get all candidates for a specific career agent
 *     tags: [CareerAgent]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: careerAgentId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID of the career agent
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, pending, proposed]
 *         description: Filter by relationship status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of relationships to return
 *     responses:
 *       200:
 *         description: Candidates retrieved successfully
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
 *                     $ref: '#/components/schemas/CareerAgent'
 *                 count:
 *                   type: integer
 *       404:
 *         description: Career agent not found
 *       401:
 *         description: Unauthorized
 */
router.get('/agent/:careerAgentId', verifyToken, async (req, res) => {
  try {
    const { careerAgentId } = req.params;
    const { status, limit = 50 } = req.query;
    
    console.log('Fetching candidates for career agent:', careerAgentId);
    
    // Build query
    const query = { careerAgentId };
    if (status) {
      query.relationshipStatus = status;
    }
    
    const relationships = await CareerAgent.find(query)
      .populate('candidate', 'firstName lastName headline industry location profilePictureUrl')
      .populate('careerAgent', 'firstName lastName')
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: relationships,
      count: relationships.length
    });
  } catch (error) {
    console.error('Error fetching candidates for career agent:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/careeragent/candidate/{candidateId}:
 *   get:
 *     summary: Get career agent for a specific candidate
 *     tags: [CareerAgent]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: candidateId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID of the candidate
 *     responses:
 *       200:
 *         description: Career agent retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/CareerAgent'
 *       404:
 *         description: No career agent found for this candidate
 *       401:
 *         description: Unauthorized
 */
router.get('/candidate/:candidateId', verifyToken, async (req, res) => {
  try {
    const { candidateId } = req.params;
    
    console.log('Fetching career agent for candidate:', candidateId);
    
    const relationship = await CareerAgent.findOne({ 
      candidateId,
      relationshipStatus: { $in: ['active', 'pending', 'proposed'] }
    })
    .populate('careerAgent', 'firstName lastName headline industry location profilePictureUrl')
    .populate('candidate', 'firstName lastName');
    
    if (!relationship) {
      return res.status(404).json({
        success: false,
        message: 'No active or pending career agent relationship found for this candidate'
      });
    }
    
    res.json({
      success: true,
      data: relationship
    });
  } catch (error) {
    console.error('Error fetching career agent for candidate:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/careeragent/{relationshipId}:
 *   put:
 *     summary: Update career agent relationship
 *     tags: [CareerAgent]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: relationshipId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the relationship to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               relationshipStatus:
 *                 type: string
 *                 enum: [active, inactive, pending, proposed]
 *               message:
 *                 type: string
 *               endDate:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Relationship updated successfully
 *       404:
 *         description: Relationship not found
 *       401:
 *         description: Unauthorized
 */
router.put('/:relationshipId', verifyToken, async (req, res) => {
  try {
    const { relationshipId } = req.params;
    const updateData = req.body;
    
    console.log('Updating career agent relationship:', relationshipId);
    
    // If setting status to inactive, set endDate
    if (updateData.relationshipStatus === 'inactive' && !updateData.endDate) {
      updateData.endDate = new Date();
    }
    
    const relationship = await CareerAgent.findOneAndUpdate(
      { _id: relationshipId },
      updateData,
      { new: true, runValidators: true }
    ).populate(['careerAgent', 'candidate']);
    
    if (!relationship) {
      return res.status(404).json({
        success: false,
        message: 'Career agent relationship not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Career agent relationship updated successfully',
      data: relationship
    });
  } catch (error) {
    console.error('Error updating career agent relationship:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/careeragent/{relationshipId}:
 *   delete:
 *     summary: Delete career agent relationship
 *     tags: [CareerAgent]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: relationshipId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the relationship to delete
 *     responses:
 *       200:
 *         description: Relationship deleted successfully
 *       404:
 *         description: Relationship not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/:relationshipId', verifyToken, async (req, res) => {
  try {
    const { relationshipId } = req.params;
    
    console.log('Deleting career agent relationship:', relationshipId);
    
    const relationship = await CareerAgent.findOneAndDelete({ _id: relationshipId });
    
    if (!relationship) {
      return res.status(404).json({
        success: false,
        message: 'Career agent relationship not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Career agent relationship deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting career agent relationship:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/careeragent/stats/agent/{careerAgentId}:
 *   get:
 *     summary: Get statistics for a career agent
 *     tags: [CareerAgent]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: careerAgentId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID of the career agent
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalCandidates:
 *                       type: integer
 *                     activeCandidates:
 *                       type: integer
 *                     pendingCandidates:
 *                       type: integer
 *                     proposedCandidates:
 *                       type: integer
 *                     inactiveCandidates:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 */
router.get('/stats/agent/:careerAgentId', verifyToken, async (req, res) => {
  try {
    const { careerAgentId } = req.params;
    
    console.log('Fetching stats for career agent:', careerAgentId);
    
    const stats = await CareerAgent.aggregate([
      { $match: { careerAgentId } },
      {
        $group: {
          _id: '$relationshipStatus',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Transform stats into a more readable format
    const formattedStats = {
      totalCandidates: 0,
      activeCandidates: 0,
      pendingCandidates: 0,
      proposedCandidates: 0,
      inactiveCandidates: 0
    };
    
    stats.forEach(stat => {
      formattedStats.totalCandidates += stat.count;
      switch (stat._id) {
        case 'active':
          formattedStats.activeCandidates = stat.count;
          break;
        case 'pending':
          formattedStats.pendingCandidates = stat.count;
          break;
        case 'proposed':
          formattedStats.proposedCandidates = stat.count;
          break;
        case 'inactive':
          formattedStats.inactiveCandidates = stat.count;
          break;
      }
    });
    
    res.json({
      success: true,
      data: formattedStats
    });
  } catch (error) {
    console.error('Error fetching career agent stats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});


export default router;
