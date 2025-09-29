import express from 'express';
import { body, validationResult } from 'express-validator';
import Connection from '../models/Connection.js';
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

// Validation for creating connection relationship
const validateConnectionRelationship = [
  body('connectionType').isIn(['friend', 'careerAgent']).withMessage('Connection type must be either friend or careerAgent'),
  body('careerAgentId').if(body('connectionType').equals('careerAgent')).trim().isLength({ min: 1 }).withMessage('Career Agent ID is required for careerAgent connections'),
  body('candidateId').if(body('connectionType').equals('careerAgent')).trim().isLength({ min: 1 }).withMessage('Candidate ID is required for careerAgent connections'),
  body('requestorUserId').if(body('connectionType').equals('friend')).trim().isLength({ min: 1 }).withMessage('Requestor User ID is required for friend connections'),
  body('recipientUserId').if(body('connectionType').equals('friend')).trim().isLength({ min: 1 }).withMessage('Recipient User ID is required for friend connections'),
  body('message').optional().trim().isLength({ max: 1000 }).withMessage('Message must be less than 1000 characters'),
  body('relationshipStatus').optional().isIn(['active', 'inactive', 'pending', 'proposed','requested','rejected']).withMessage('Invalid relationship status')
];

/**
 * @swagger
 * components:
 *   schemas:
 *     Connection:
 *       type: object
 *       required:
 *         - requestorUserId
 *         - recipientUserId
 *         - connectionType
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the connection
 *         careerAgentId:
 *           type: string
 *           description: User ID of the career agent (required for careerAgent type)
 *         candidateId:
 *           type: string
 *           description: User ID of the candidate (required for careerAgent type)
 *         requestorUserId:
 *           type: string
 *           description: User ID of the person who initiated the connection
 *         recipientUserId:
 *           type: string
 *           description: User ID of the person who received the connection request
 *         connectionType:
 *           type: string
 *           enum: [friend, careerAgent]
 *           description: Type of connection
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
 * /api/connections:
 *   post:
 *     summary: Create a connection relationship
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - requestorUserId
 *               - recipientUserId
 *               - connectionType
 *             properties:
 *               careerAgentId:
 *                 type: string
 *                 description: User ID of the career agent (required for careerAgent type)
 *               candidateId:
 *                 type: string
 *                 description: User ID of the candidate (required for careerAgent type)
 *               requestorUserId:
 *                 type: string
 *                 description: User ID of the person initiating the connection
 *               recipientUserId:
 *                 type: string
 *                 description: User ID of the person receiving the connection request
 *               connectionType:
 *                 type: string
 *                 enum: [friend, careerAgent]
 *                 description: Type of connection
 *               message:
 *                 type: string
 *                 description: Additional message about the relationship
 *               relationshipStatus:
 *                 type: string
 *                 enum: [active, inactive, pending, proposed, requested, rejected]
 *                 default: active
 *     responses:
 *       201:
 *         description: Connection relationship created successfully
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
 *                   $ref: '#/components/schemas/Connection'
 *       400:
 *         description: Validation error or connection already exists
 *       404:
 *         description: User profile not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/', verifyToken, validateConnectionRelationship, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        console.error('Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { 
      careerAgentId, 
      candidateId, 
      requestorUserId, 
      recipientUserId, 
      connectionType, 
      message, 
      relationshipStatus = 'pending' 
    } = req.body;

    // For careerAgent type, require careerAgentId and candidateId
    if (connectionType === 'careerAgent') {
      if (!careerAgentId || !candidateId) {
        console.error('Missing required fields for careerAgent connection:', { careerAgentId, candidateId });
        return res.status(400).json({
          success: false,
          message: 'careerAgentId and candidateId are required for careerAgent connection type'
        });
      }
    }
    else if (connectionType === 'friend') {
      // For friend type, no additional fields are required
      if (!requestorUserId || !recipientUserId) {
        console.error('Missing required fields for friend connection:', { requestorUserId, recipientUserId });  
        return res.status(400).json({
          success: false,
          message: 'requestorUserId and recipientUserId are required for friend connection type'
        });
      } 
    }

    // Check if requestor and recipient profiles exist
    const [requestorProfile, recipientProfile] = await Promise.all([
      UserProfile.findOne({ userId: requestorUserId }),
      UserProfile.findOne({ userId: recipientUserId })
    ]);

    if (!requestorProfile) {
        console.error('Requestor profile not found:', requestorUserId);
      return res.status(404).json({
        success: false,
        message: 'Requestor profile not found'
      });
    }

    if (!recipientProfile) {
        console.error('Recipient profile not found:', recipientUserId);
      return res.status(404).json({
        success: false,
        message: 'Recipient profile not found'
      });
    }

    // Check for existing connection
    const existingConnection = await Connection.findOne({
      $or: [
        { requestorUserId, recipientUserId, connectionType },
        { requestorUserId: recipientUserId, recipientUserId: requestorUserId, connectionType }
      ]
    });

    if (existingConnection) {
        console.error('Connection already exists:', { existingConnection });
      return res.status(400).json({
        success: false,
        message: `${connectionType} connection already exists between these users`
      });
    }

    // Create the connection
    const connectionData = {
      requestorUserId,
      recipientUserId,
      connectionType,
      relationshipStatus,
      message
    };

    // Add careerAgent-specific fields if applicable
    if (connectionType === 'careerAgent') {
      connectionData.careerAgentId = careerAgentId;
      connectionData.candidateId = candidateId;
    }

    const connection = new Connection(connectionData);
    await connection.save();

    // Populate the connection with user details
    const populatedConnection = await Connection.findById(connection._id)
      .populate('requestor')
      .populate('recipient')
      .populate('careerAgent')
      .populate('candidate');

    res.status(201).json({
      success: true,
      message: `${connectionType} connection created successfully`,
      data: populatedConnection
    });

  } catch (error) {
    console.error('Error creating connection:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A connection of this type already exists between these users'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/connections/request:
 *   post:
 *     summary: Send a connection request
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - recipientUserId
 *               - connectionType
 *             properties:
 *               recipientUserId:
 *                 type: string
 *                 description: User ID of the person to send request to
 *               connectionType:
 *                 type: string
 *                 enum: [friend, careerAgent]
 *                 description: Type of connection being requested
 *               message:
 *                 type: string
 *                 description: Optional message with the request
 *     responses:
 *       201:
 *         description: Connection request sent successfully
 *       400:
 *         description: Validation error or request already exists
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/request', verifyToken, async (req, res) => {
  try {
    console.log('Received request to send connection request:', req.body);
    const { recipientUserId, connectionType, message } = req.body;
    const requestorUserId = req.user.userId;

    if (!recipientUserId || !connectionType) {
      return res.status(400).json({
        success: false,
        message: 'recipientUserId and connectionType are required'
      });
    }

    if (!['friend', 'careerAgent'].includes(connectionType)) {
      return res.status(400).json({
        success: false,
        message: 'connectionType must be either friend or careerAgent'
      });
    }

    // Check if recipient profile exists
    const recipientProfile = await UserProfile.findOne({ userId: recipientUserId });
    if (!recipientProfile) {
      return res.status(404).json({
        success: false,
        message: 'Recipient profile not found'
      });
    }

    // Check for existing connection or request
    const existingConnection = await Connection.findOne({
      $or: [
        { requestorUserId, recipientUserId, connectionType },
        { requestorUserId: recipientUserId, recipientUserId: requestorUserId, connectionType }
      ]
    });

    if (existingConnection) {
      return res.status(400).json({
        success: false,
        message: `${connectionType} connection or request already exists`
      });
    }

    // Create connection data
    const connectionData = {
      requestorUserId,
      recipientUserId,
      connectionType,
      relationshipStatus: 'requested',
      message
    };

    // For careerAgent type, set appropriate roles
    if (connectionType === 'careerAgent') {
      connectionData.careerAgentId = requestorUserId;
      connectionData.candidateId = recipientUserId;
    }

    const connection = new Connection(connectionData);
    await connection.save();

    // Populate and return
    const populatedConnection = await Connection.findById(connection._id)
      .populate('requestor')
      .populate('recipient')
      .populate('careerAgent')
      .populate('candidate');

    res.status(201).json({
      success: true,
      message: `${connectionType} request sent successfully`,
      data: populatedConnection
    });

  } catch (error) {
    console.error('Error sending connection request:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/connections/propose:
 *   post:
 *     summary: Propose yourself as a career agent to someone
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - candidateUserId
 *             properties:
 *               candidateUserId:
 *                 type: string
 *                 description: User ID of the person you want to mentor
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
    const { candidateUserId, message } = req.body;
    const careerAgentUserId = req.user.userId;

    if (!candidateUserId) {
      return res.status(400).json({
        success: false,
        message: 'candidateUserId is required'
      });
    }

    // Check if candidate profile exists
    const candidateProfile = await UserProfile.findOne({ userId: candidateUserId });
    if (!candidateProfile) {
      return res.status(404).json({
        success: false,
        message: 'Candidate profile not found'
      });
    }

    // Check for existing careerAgent connection
    const existingConnection = await Connection.findOne({
      $or: [
        { careerAgentId: careerAgentUserId, candidateId: candidateUserId, connectionType: 'careerAgent' },
        { requestorUserId: careerAgentUserId, recipientUserId: candidateUserId, connectionType: 'careerAgent' },
        { requestorUserId: candidateUserId, recipientUserId: careerAgentUserId, connectionType: 'careerAgent' }
      ]
    });

    if (existingConnection) {
      return res.status(400).json({
        success: false,
        message: 'Career agent connection or proposal already exists'
      });
    }

    const connection = new Connection({
      careerAgentId: careerAgentUserId,
      candidateId: candidateUserId,
      requestorUserId: careerAgentUserId,
      recipientUserId: candidateUserId,
      connectionType: 'careerAgent',
      relationshipStatus: 'proposed',
      message
    });

    await connection.save();

    // Populate and return
    const populatedConnection = await Connection.findById(connection._id)
      .populate('requestor')
      .populate('recipient')
      .populate('careerAgent')
      .populate('candidate');

    res.status(201).json({
      success: true,
      message: 'Career agent proposal sent successfully',
      data: populatedConnection
    });

  } catch (error) {
    console.error('Error sending career agent proposal:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/connections/requests/received:
 *   get:
 *     summary: Get all pending requests received by current user with comprehensive user data
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of requests to return
 *       - in: query
 *         name: connectionType
 *         schema:
 *           type: string
 *           enum: [friend, careerAgent]
 *         description: Filter by connection type
 *     responses:
 *       200:
 *         description: Requests retrieved successfully with enhanced user information
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
 *                         description: User ID of the person who sent the request
 *                       connectionId:
 *                         type: string
 *                         description: Connection document ID
 *                       firstName:
 *                         type: string
 *                       lastName:
 *                         type: string
 *                       headline:
 *                         type: string
 *                         description: Professional headline
 *                       company:
 *                         type: string
 *                         description: Company name (with fallback to industry)
 *                       profilePictureUrl:
 *                         type: string
 *                       mutualConnections:
 *                         type: integer
 *                         description: Number of mutual friends
 *                       candidatesCount:
 *                         type: integer
 *                         description: Number of people this user mentors as career agent
 *                       requestTypes:
 *                         type: array
 *                         items:
 *                           type: string
 *                           enum: [friend_request, career_agent_request, career_agent_proposal]
 *                       connectionTypes:
 *                         type: array
 *                         items:
 *                           type: string
 *                           enum: [friend, careerAgent]
 *                       requestDate:
 *                         type: string
 *                         format: date-time
 *                       relationshipStatus:
 *                         type: string
 *                         enum: [requested, proposed, pending]
 *                       message:
 *                         type: string
 *                 count:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/requests/received', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 50;
    const { connectionType } = req.query;

    console.log('=== /requests/received START ===');
    console.log('User ID:', userId);
    console.log('Query parameters:', { limit, connectionType });

    // Enhanced strategy: Get all users who sent requests/proposals to me in any form
    const pipeline = [
      // Stage 1: Match all connections where current user is recipient/candidate and status is pending
      {
        $match: {
          $or: [
            // Case 1: Other user requested me to become their friend
            {
              recipientUserId: userId,
              connectionType: 'friend',
              relationshipStatus: { $in: ['requested', 'pending'] }
            },
            // Case 2: Other user requested me to become their career agent
            {
              candidateId: userId,
              connectionType: 'careerAgent',
              relationshipStatus: { $in: ['requested', 'pending'] }
            },
            // Case 3: Other user proposed/requested me to make them my career agent
            {
              recipientUserId: userId,
              connectionType: 'careerAgent',
              relationshipStatus: { $in: ['proposed', 'pending'] }
            }
          ],
          ...(connectionType && { connectionType })
        }
      },
      // Stage 2: Add field to identify the other user (requestor) based on request type
      {
        $addFields: {
          otherUserId: {
            $switch: {
              branches: [
                // For friend requests, the other user is requestor
                { 
                  case: { 
                    $and: [
                      { $eq: ['$connectionType', 'friend'] },
                      { $eq: ['$recipientUserId', userId] }
                    ]
                  }, 
                  then: '$requestorUserId' 
                },
                // For career agent requests where I'm the candidate, the other user is career agent
                { 
                  case: { 
                    $and: [
                      { $eq: ['$connectionType', 'careerAgent'] },
                      { $eq: ['$candidateId', userId] }
                    ]
                  }, 
                  then: '$careerAgentId' 
                },
                // For career agent proposals where I'm the recipient, the other user is requestor
                { 
                  case: { 
                    $and: [
                      { $eq: ['$connectionType', 'careerAgent'] },
                      { $eq: ['$recipientUserId', userId] }
                    ]
                  }, 
                  then: '$requestorUserId' 
                }
              ],
              default: null
            }
          },
          requestType: {
            $switch: {
              branches: [
                { 
                  case: { 
                    $and: [
                      { $eq: ['$connectionType', 'friend'] },
                      { $eq: ['$recipientUserId', userId] }
                    ]
                  }, 
                  then: 'friend_request' 
                },
                { 
                  case: { 
                    $and: [
                      { $eq: ['$connectionType', 'careerAgent'] },
                      { $eq: ['$candidateId', userId] }
                    ]
                  }, 
                  then: 'career_agent_request' 
                },
                { 
                  case: { 
                    $and: [
                      { $eq: ['$connectionType', 'careerAgent'] },
                      { $eq: ['$recipientUserId', userId] }
                    ]
                  }, 
                  then: 'career_agent_proposal' 
                }
              ],
              default: 'unknown'
            }
          }
        }
      },
      // Stage 3: Group by other user to avoid duplicates and collect request info
      {
        $group: {
          _id: '$otherUserId',
          requests: { $push: '$$ROOT' },
          requestTypes: { $addToSet: '$requestType' },
          connectionTypes: { $addToSet: '$connectionType' }
        }
      },
      // Stage 4: Lookup other user's profile
      {
        $lookup: {
          from: 'userprofiles',
          localField: '_id',
          foreignField: 'userId',
          as: 'userProfile'
        }
      },
      // Stage 5: Lookup other user's friend connections count (mutual connections)
      {
        $lookup: {
          from: 'connections',
          let: { otherUserId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $or: [
                        { $eq: ['$requestorUserId', '$$otherUserId'] },
                        { $eq: ['$recipientUserId', '$$otherUserId'] }
                      ]
                    },
                    { $eq: ['$connectionType', 'friend'] },
                    { $eq: ['$relationshipStatus', 'active'] }
                  ]
                }
              }
            },
            { $count: 'friendsCount' }
          ],
          as: 'friendsStats'
        }
      },
      // Stage 6: Lookup how many candidates this user is career agent for
      {
        $lookup: {
          from: 'connections',
          let: { otherUserId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$careerAgentId', '$$otherUserId'] },
                    { $eq: ['$connectionType', 'careerAgent'] },
                    { $eq: ['$relationshipStatus', 'active'] }
                  ]
                }
              }
            },
            { $count: 'candidatesCount' }
          ],
          as: 'careerAgentStats'
        }
      },
      // Stage 7: Project the final structure
      {
        $project: {
          _id: 0,
          userId: '$_id',
          connectionId: { $toString: { $arrayElemAt: ['$requests._id', 0] } },
          firstName: { $arrayElemAt: ['$userProfile.firstName', 0] },
          lastName: { $arrayElemAt: ['$userProfile.lastName', 0] },
          headline: { $arrayElemAt: ['$userProfile.headline', 0] },
          company: { 
            $ifNull: [
              { $arrayElemAt: ['$userProfile.company', 0] },
              { $arrayElemAt: ['$userProfile.industry', 0] }
            ]
          },
          profilePictureUrl: { $arrayElemAt: ['$userProfile.profilePictureUrl', 0] },
          mutualConnections: { 
            $ifNull: [{ $arrayElemAt: ['$friendsStats.friendsCount', 0] }, 0]
          },
          candidatesCount: {
            $ifNull: [{ $arrayElemAt: ['$careerAgentStats.candidatesCount', 0] }, 0]
          },
          requestTypes: 1,
          connectionTypes: 1,
          requestDate: { $arrayElemAt: ['$requests.createdAt', 0] },
          relationshipStatus: { $arrayElemAt: ['$requests.relationshipStatus', 0] },
          message: { $arrayElemAt: ['$requests.message', 0] }
        }
      },
      // Stage 8: Sort and limit
      { $sort: { requestDate: -1 } },
      { $limit: limit }
    ];

    console.log('Enhanced aggregation pipeline:', JSON.stringify(pipeline, null, 2));

    const requests = await Connection.aggregate(pipeline);

    console.log('Raw aggregation result count:', requests.length);
    console.log('Sample aggregation result (first item):', 
      requests.length > 0 ? JSON.stringify(requests[0], null, 2) : 'No results');
    console.log('Fetched received requests:', requests.length, 'requests found');
    console.log('Request breakdown by type:', requests.map(r => ({ userId: r.userId, types: r.requestTypes })));
    console.log('****requests:', JSON.stringify(requests, null, 2), );
    console.log('=== /requests/received END ===');
    
    res.json({
      success: true,
      data: requests,
      count: requests.length
    });

  } catch (error) {
    console.error('=== /requests/received ERROR ===');
    console.error('Error details:', error);
    console.error('Error stack:', error.stack);
    console.error('=== /requests/received ERROR END ===');
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/connections/requests/sent:
 *   get:
 *     summary: Get all requests sent by current user with comprehensive recipient data
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of requests to return
 *       - in: query
 *         name: connectionType
 *         schema:
 *           type: string
 *           enum: [friend, careerAgent]
 *         description: Filter by connection type
 *     responses:
 *       200:
 *         description: Sent requests retrieved successfully with enhanced user information
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
 *                         description: User ID of the request recipient
 *                       connectionId:
 *                         type: string
 *                         description: Connection document ID
 *                       firstName:
 *                         type: string
 *                       lastName:
 *                         type: string
 *                       headline:
 *                         type: string
 *                         description: Professional headline
 *                       company:
 *                         type: string
 *                         description: Company name (with fallback to industry)
 *                       profilePictureUrl:
 *                         type: string
 *                       mutualConnections:
 *                         type: integer
 *                         description: Number of mutual friends
 *                       candidatesCount:
 *                         type: integer
 *                         description: Number of people this user mentors as career agent
 *                       requestTypes:
 *                         type: array
 *                         items:
 *                           type: string
 *                           enum: [friend_request, career_agent_request, career_agent_proposal]
 *                       connectionTypes:
 *                         type: array
 *                         items:
 *                           type: string
 *                           enum: [friend, careerAgent]
 *                       requestDate:
 *                         type: string
 *                         format: date-time
 *                       relationshipStatus:
 *                         type: string
 *                         enum: [requested, proposed, pending]
 *                       message:
 *                         type: string
 *                 count:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/requests/sent', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 50;
    const { connectionType } = req.query;

    console.log('=== /requests/sent START ===');
    console.log('User ID:', userId);
    console.log('Query parameters:', { limit, connectionType });

    // Enhanced strategy: Get all users to whom I sent requests/proposals in any form
    const pipeline = [
      // Stage 1: Match all connections where current user sent requests and status is pending
      {
        $match: {
          $or: [
            // Case 1: I requested other user to become my friend
            {
              requestorUserId: userId,
              connectionType: 'friend',
              relationshipStatus: { $in: ['requested', 'pending'] }
            },
            // Case 2: I requested other user to become my career agent
            {
              careerAgentId: userId,
              connectionType: 'careerAgent',
              relationshipStatus: { $in: ['requested', 'pending'] }
            },
            // Case 3: I proposed/requested other user to accept me as their career agent
            {
              requestorUserId: userId,
              connectionType: 'careerAgent',
              relationshipStatus: { $in: ['proposed', 'pending'] }
            }
          ],
          ...(connectionType && { connectionType })
        }
      },
      // Stage 2: Add field to identify the other user (recipient) based on request type
      {
        $addFields: {
          otherUserId: {
            $switch: {
              branches: [
                // For friend requests, the other user is recipient
                { 
                  case: { 
                    $and: [
                      { $eq: ['$connectionType', 'friend'] },
                      { $eq: ['$requestorUserId', userId] }
                    ]
                  }, 
                  then: '$recipientUserId' 
                },
                // For career agent requests where I'm the career agent, the other user is candidate
                { 
                  case: { 
                    $and: [
                      { $eq: ['$connectionType', 'careerAgent'] },
                      { $eq: ['$careerAgentId', userId] }
                    ]
                  }, 
                  then: '$candidateId' 
                },
                // For career agent proposals where I'm the requestor, the other user is recipient
                { 
                  case: { 
                    $and: [
                      { $eq: ['$connectionType', 'careerAgent'] },
                      { $eq: ['$requestorUserId', userId] }
                    ]
                  }, 
                  then: '$recipientUserId' 
                }
              ],
              default: null
            }
          },
          requestType: {
            $switch: {
              branches: [
                { 
                  case: { 
                    $and: [
                      { $eq: ['$connectionType', 'friend'] },
                      { $eq: ['$requestorUserId', userId] }
                    ]
                  }, 
                  then: 'friend_request' 
                },
                { 
                  case: { 
                    $and: [
                      { $eq: ['$connectionType', 'careerAgent'] },
                      { $eq: ['$careerAgentId', userId] }
                    ]
                  }, 
                  then: 'career_agent_request' 
                },
                { 
                  case: { 
                    $and: [
                      { $eq: ['$connectionType', 'careerAgent'] },
                      { $eq: ['$requestorUserId', userId] }
                    ]
                  }, 
                  then: 'career_agent_proposal' 
                }
              ],
              default: 'unknown'
            }
          }
        }
      },
      // Stage 3: Group by other user to avoid duplicates and collect request info
      {
        $group: {
          _id: '$otherUserId',
          requests: { $push: '$$ROOT' },
          requestTypes: { $addToSet: '$requestType' },
          connectionTypes: { $addToSet: '$connectionType' }
        }
      },
      // Stage 4: Lookup other user's profile
      {
        $lookup: {
          from: 'userprofiles',
          localField: '_id',
          foreignField: 'userId',
          as: 'userProfile'
        }
      },
      // Stage 5: Lookup other user's friend connections count (mutual connections)
      {
        $lookup: {
          from: 'connections',
          let: { otherUserId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $or: [
                        { $eq: ['$requestorUserId', '$$otherUserId'] },
                        { $eq: ['$recipientUserId', '$$otherUserId'] }
                      ]
                    },
                    { $eq: ['$connectionType', 'friend'] },
                    { $eq: ['$relationshipStatus', 'active'] }
                  ]
                }
              }
            },
            { $count: 'friendsCount' }
          ],
          as: 'friendsStats'
        }
      },
      // Stage 6: Lookup how many candidates this user is career agent for
      {
        $lookup: {
          from: 'connections',
          let: { otherUserId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$careerAgentId', '$$otherUserId'] },
                    { $eq: ['$connectionType', 'careerAgent'] },
                    { $eq: ['$relationshipStatus', 'active'] }
                  ]
                }
              }
            },
            { $count: 'candidatesCount' }
          ],
          as: 'careerAgentStats'
        }
      },
      // Stage 7: Project the final structure
      {
        $project: {
          _id: 0,
          userId: '$_id',
          connectionId: { $toString: { $arrayElemAt: ['$requests._id', 0] } },
          firstName: { $arrayElemAt: ['$userProfile.firstName', 0] },
          lastName: { $arrayElemAt: ['$userProfile.lastName', 0] },
          headline: { $arrayElemAt: ['$userProfile.headline', 0] },
          company: { 
            $ifNull: [
              { $arrayElemAt: ['$userProfile.company', 0] },
              { $arrayElemAt: ['$userProfile.industry', 0] }
            ]
          },
          profilePictureUrl: { $arrayElemAt: ['$userProfile.profilePictureUrl', 0] },
          mutualConnections: { 
            $ifNull: [{ $arrayElemAt: ['$friendsStats.friendsCount', 0] }, 0]
          },
          candidatesCount: {
            $ifNull: [{ $arrayElemAt: ['$careerAgentStats.candidatesCount', 0] }, 0]
          },
          requestTypes: 1,
          connectionTypes: 1,
          requestDate: { $arrayElemAt: ['$requests.createdAt', 0] },
          relationshipStatus: { $arrayElemAt: ['$requests.relationshipStatus', 0] },
          message: { $arrayElemAt: ['$requests.message', 0] }
        }
      },
      // Stage 8: Sort and limit
      { $sort: { requestDate: -1 } },
      { $limit: limit }
    ];

    console.log('Enhanced aggregation pipeline:', JSON.stringify(pipeline, null, 2));

    const requests = await Connection.aggregate(pipeline);

    console.log('Raw aggregation result count:', requests.length);
    console.log('Sample aggregation result (first item):', 
      requests.length > 0 ? JSON.stringify(requests[0], null, 2) : 'No results');
    console.log('Fetched sent requests:', requests.length, 'requests found');
    console.log('Request breakdown by type:', requests.map(r => ({ userId: r.userId, types: r.requestTypes })));
    console.log('****sent requests:', JSON.stringify(requests, null, 2));
    console.log('=== /requests/sent END ===');

    res.json({
      success: true,
      data: requests,
      count: requests.length
    });

  } catch (error) {
    console.error('=== /requests/sent ERROR ===');
    console.error('Error details:', error);
    console.error('Error stack:', error.stack);
    console.error('=== /requests/sent ERROR END ===');
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/connections/proposals/received:
 *   get:
 *     summary: Get all proposals received by current user
 *     tags: [Connections]
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
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 50;

    const proposals = await Connection.find({
      candidateId: userId,
      connectionType: 'careerAgent',
      relationshipStatus: 'proposed'
    })
      .populate('requestor')
      .populate('recipient')
      .populate('careerAgent')
      .populate('candidate')
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({
      success: true,
      data: proposals,
      count: proposals.length
    });

  } catch (error) {
    console.error('Error fetching received proposals:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/connections/proposals/sent:
 *   get:
 *     summary: Get all proposals sent by current user
 *     tags: [Connections]
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
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 50;

    const proposals = await Connection.find({
      careerAgentId: userId,
      connectionType: 'careerAgent',
      relationshipStatus: 'proposed'
    })
      .populate('requestor')
      .populate('recipient')
      .populate('careerAgent')
      .populate('candidate')
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({
      success: true,
      data: proposals,
      count: proposals.length
    });

  } catch (error) {
    console.error('Error fetching sent proposals:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/connections/connected:
 *   get:
 *     summary: Get all active connections for current user with comprehensive relationship data
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of connections to return
 *       - in: query
 *         name: connectionType
 *         schema:
 *           type: string
 *           enum: [friend, careerAgent]
 *         description: Filter by connection type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *           default: active
 *         description: Filter by relationship status
 *     responses:
 *       200:
 *         description: Connected relationships retrieved successfully with enhanced user information
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
 *                         description: User ID of the connected person
 *                       connectionId:
 *                         type: string
 *                         description: Connection document ID
 *                       firstName:
 *                         type: string
 *                       lastName:
 *                         type: string
 *                       headline:
 *                         type: string
 *                         description: Professional headline
 *                       company:
 *                         type: string
 *                         description: Company name (with fallback to industry)
 *                       profilePictureUrl:
 *                         type: string
 *                       mutualConnections:
 *                         type: integer
 *                         description: Number of mutual friends
 *                       candidatesCount:
 *                         type: integer
 *                         description: Number of people this user mentors as career agent
 *                       connectionTypes:
 *                         type: array
 *                         items:
 *                           type: string
 *                           enum: [friend, careerAgent]
 *                         description: Types of connections with this user
 *                       roles:
 *                         type: array
 *                         items:
 *                           type: string
 *                           enum: [requestor, recipient, careerAgent, candidate]
 *                         description: Current user's role in each connection
 *                       connectionDate:
 *                         type: string
 *                         format: date-time
 *                         description: When the connection was established
 *                 count:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/connected', verifyToken, async (req, res) => {
  try {
    console.log('=== /connected START ===');
    console.log('Fetching connected relationships for user:', req.user.userId);
    console.log('Query parameters:', req.query);
    
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 50;
    const { connectionType, status = 'active' } = req.query;

    // Build the aggregation pipeline to get connected users with their stats
    const pipeline = [
      // Stage 1: Match all connections where current user is involved and status is active
      {
        $match: {
          $or: [
            { requestorUserId: userId },
            { recipientUserId: userId },
            { careerAgentId: userId },
            { candidateId: userId }
          ],
          relationshipStatus: status,
          ...(connectionType && { connectionType })
        }
      },
      // Stage 2: Add field to identify the other user in each connection
      {
        $addFields: {
          otherUserId: {
            $switch: {
              branches: [
                // If I'm the requestor, the other user is recipient
                { case: { $eq: ['$requestorUserId', userId] }, then: '$recipientUserId' },
                // If I'm the recipient, the other user is requestor
                { case: { $eq: ['$recipientUserId', userId] }, then: '$requestorUserId' },
                // If I'm the career agent, the other user is candidate
                { case: { $eq: ['$careerAgentId', userId] }, then: '$candidateId' },
                // If I'm the candidate, the other user is career agent
                { case: { $eq: ['$candidateId', userId] }, then: '$careerAgentId' }
              ],
              default: null
            }
          },
          connectionRole: {
            $switch: {
              branches: [
                { case: { $eq: ['$requestorUserId', userId] }, then: 'requestor' },
                { case: { $eq: ['$recipientUserId', userId] }, then: 'recipient' },
                { case: { $eq: ['$careerAgentId', userId] }, then: 'careerAgent' },
                { case: { $eq: ['$candidateId', userId] }, then: 'candidate' }
              ],
              default: 'unknown'
            }
          }
        }
      },
      // Stage 3: Group by other user to avoid duplicates and collect connection info
      {
        $group: {
          _id: '$otherUserId',
          connections: { $push: '$$ROOT' },
          connectionTypes: { $addToSet: '$connectionType' },
          roles: { $addToSet: '$connectionRole' }
        }
      },
      // Stage 4: Lookup other user's profile
      {
        $lookup: {
          from: 'userprofiles',
          localField: '_id',
          foreignField: 'userId',
          as: 'userProfile'
        }
      },
      // Stage 5: Lookup other user's friend connections count (mutual connections)
      {
        $lookup: {
          from: 'connections',
          let: { otherUserId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $or: [
                        { $eq: ['$requestorUserId', '$$otherUserId'] },
                        { $eq: ['$recipientUserId', '$$otherUserId'] }
                      ]
                    },
                    { $eq: ['$connectionType', 'friend'] },
                    { $eq: ['$relationshipStatus', 'active'] }
                  ]
                }
              }
            },
            { $count: 'friendsCount' }
          ],
          as: 'friendsStats'
        }
      },
      // Stage 6: Lookup how many candidates this user is career agent for
      {
        $lookup: {
          from: 'connections',
          let: { otherUserId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$careerAgentId', '$$otherUserId'] },
                    { $eq: ['$connectionType', 'careerAgent'] },
                    { $eq: ['$relationshipStatus', 'active'] }
                  ]
                }
              }
            },
            { $count: 'candidatesCount' }
          ],
          as: 'careerAgentStats'
        }
      },
      // Stage 7: Project the final structure
      {
        $project: {
          _id: 0,
          userId: '$_id',
          connectionId: { $toString: { $arrayElemAt: ['$connections._id', 0] } },
          firstName: { $arrayElemAt: ['$userProfile.firstName', 0] },
          lastName: { $arrayElemAt: ['$userProfile.lastName', 0] },
          headline: { $arrayElemAt: ['$userProfile.headline', 0] },
          company: { 
            $ifNull: [
              { $arrayElemAt: ['$userProfile.company', 0] },
              { $arrayElemAt: ['$userProfile.industry', 0] }
            ]
          },
          profilePictureUrl: { $arrayElemAt: ['$userProfile.profilePictureUrl', 0] },
          mutualConnections: { 
            $ifNull: [{ $arrayElemAt: ['$friendsStats.friendsCount', 0] }, 0]
          },
          candidatesCount: {
            $ifNull: [{ $arrayElemAt: ['$careerAgentStats.candidatesCount', 0] }, 0]
          },
          connectionTypes: 1,
          roles: 1,
          connectionDate: { $arrayElemAt: ['$connections.createdAt', 0] }
        }
      },
      // Stage 8: Sort and limit
      { $sort: { connectionDate: -1 } },
      { $limit: limit }
    ];

    console.log('Aggregation pipeline:', JSON.stringify(pipeline, null, 2));

    const connectedUsers = await Connection.aggregate(pipeline);

    console.log('Raw aggregation result count:', connectedUsers.length);
    console.log('Sample result (first item):', 
      connectedUsers.length > 0 ? JSON.stringify(connectedUsers[0], null, 2) : 'No results');
    console.log('Retrieved connected users:', connectedUsers.length);
    console.log('Connected users data:', connectedUsers);
    console.log('=== /connected END ===');

    res.json({
      success: true,
      data: connectedUsers,
      count: connectedUsers.length
    });

  } catch (error) {
    console.error('=== /connected ERROR ===');
    console.error('Error details:', error);
    console.error('Error stack:', error.stack);
    console.error('=== /connected ERROR END ===');
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/connections/potentialcontact:
 *   get:
 *     summary: Get potential contacts for networking with comprehensive filtering and user statistics
 *     description: |
 *       Returns users who are not already connected to the current user in any capacity.
 *       Excludes users with existing connections except those with 'rejected' or 'inactive' status.
 *       Includes mutual connection counts and career agent statistics for each potential contact.
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of suggestions to return
 *       - in: query
 *         name: connectionType
 *         schema:
 *           type: string
 *           enum: [friend, careerAgent]
 *         description: Filter suggestions for specific connection type (currently not implemented)
 *     responses:
 *       200:
 *         description: Potential contacts retrieved successfully with enhanced user information
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
 *                         description: User ID of the potential contact
 *                       connectionId:
 *                         type: null
 *                         description: Always null for potential contacts
 *                       firstName:
 *                         type: string
 *                       lastName:
 *                         type: string
 *                       headline:
 *                         type: string
 *                         description: Professional headline
 *                       company:
 *                         type: string
 *                         description: Company name (with fallback to industry)
 *                       profilePictureUrl:
 *                         type: string
 *                       mutualConnections:
 *                         type: integer
 *                         description: Number of mutual friends
 *                       candidatesCount:
 *                         type: integer
 *                         description: Number of people this user mentors as career agent
 *                 count:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/potentialcontact', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 50;
    const { connectionType } = req.query;

    console.log('=== /potentialcontact START ===');
    console.log('User ID:', userId);
    console.log('Query parameters:', { limit, connectionType });

    // Enhanced strategy: Use aggregation to filter out users I'm already connected to
    // and get comprehensive user information with relationship statistics
    const pipeline = [
      // Stage 1: Start from all user profiles except current user
      {
        $match: {
          userId: { $ne: userId }
        }
      },
      // Stage 2: Lookup to check if there's any existing connection with this user
      {
        $lookup: {
          from: 'connections',
          let: { otherUserId: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    // Check all possible ways I could be connected to this user
                    {
                      $or: [
                        // Case 1: Friend connections where I'm requestor or recipient
                        {
                          $and: [
                            { $eq: ['$connectionType', 'friend'] },
                            {
                              $or: [
                                {
                                  $and: [
                                    { $eq: ['$requestorUserId', userId] },
                                    { $eq: ['$recipientUserId', '$$otherUserId'] }
                                  ]
                                },
                                {
                                  $and: [
                                    { $eq: ['$requestorUserId', '$$otherUserId'] },
                                    { $eq: ['$recipientUserId', userId] }
                                  ]
                                }
                              ]
                            }
                          ]
                        },
                        // Case 2: Career agent connections where I'm the career agent
                        {
                          $and: [
                            { $eq: ['$connectionType', 'careerAgent'] },
                            { $eq: ['$careerAgentId', userId] },
                            { $eq: ['$candidateId', '$$otherUserId'] }
                          ]
                        },
                        // Case 3: Career agent connections where I'm the candidate
                        {
                          $and: [
                            { $eq: ['$connectionType', 'careerAgent'] },
                            { $eq: ['$careerAgentId', '$$otherUserId'] },
                            { $eq: ['$candidateId', userId] }
                          ]
                        },
                        // Case 4: Career agent connections via requestor/recipient fields
                        {
                          $and: [
                            { $eq: ['$connectionType', 'careerAgent'] },
                            {
                              $or: [
                                {
                                  $and: [
                                    { $eq: ['$requestorUserId', userId] },
                                    { $eq: ['$recipientUserId', '$$otherUserId'] }
                                  ]
                                },
                                {
                                  $and: [
                                    { $eq: ['$requestorUserId', '$$otherUserId'] },
                                    { $eq: ['$recipientUserId', userId] }
                                  ]
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    },
                    // Exclude rejected and inactive connections (allow these users to appear as suggestions)
                    { $nin: ['$relationshipStatus', ['rejected', 'inactive']] }
                  ]
                }
              }
            }
          ],
          as: 'existingConnections'
        }
      },
      // Stage 3: Filter out users who have existing connections (not rejected/inactive)
      {
        $match: {
          existingConnections: { $size: 0 }
        }
      },
      // Stage 4: Lookup this user's friend connections count (mutual connections)
      {
        $lookup: {
          from: 'connections',
          let: { otherUserId: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $or: [
                        { $eq: ['$requestorUserId', '$$otherUserId'] },
                        { $eq: ['$recipientUserId', '$$otherUserId'] }
                      ]
                    },
                    { $eq: ['$connectionType', 'friend'] },
                    { $eq: ['$relationshipStatus', 'active'] }
                  ]
                }
              }
            },
            { $count: 'friendsCount' }
          ],
          as: 'friendsStats'
        }
      },
      // Stage 5: Lookup how many candidates this user is career agent for
      {
        $lookup: {
          from: 'connections',
          let: { otherUserId: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$careerAgentId', '$$otherUserId'] },
                    { $eq: ['$connectionType', 'careerAgent'] },
                    { $eq: ['$relationshipStatus', 'active'] }
                  ]
                }
              }
            },
            { $count: 'candidatesCount' }
          ],
          as: 'careerAgentStats'
        }
      },
      // Stage 6: Project the final structure
      {
        $project: {
          _id: 0,
          userId: 1,
          connectionId: null, // No connection ID for potential contacts
          firstName: 1,
          lastName: 1,
          headline: 1,
          company: { 
            $ifNull: ['$company', '$industry']
          },
          profilePictureUrl: 1,
          mutualConnections: { 
            $ifNull: [{ $arrayElemAt: ['$friendsStats.friendsCount', 0] }, 0]
          },
          candidatesCount: {
            $ifNull: [{ $arrayElemAt: ['$careerAgentStats.candidatesCount', 0] }, 0]
          }
        }
      },
      // Stage 7: Sort and limit
      { $sort: { firstName: 1, lastName: 1 } },
      { $limit: limit }
    ];

    console.log('Enhanced aggregation pipeline for potential contacts:', JSON.stringify(pipeline, null, 2));

    const potentialContacts = await UserProfile.aggregate(pipeline);

    console.log('Raw aggregation result count:', potentialContacts.length);
    console.log('Sample potential contact (first item):', 
      potentialContacts.length > 0 ? JSON.stringify(potentialContacts[0], null, 2) : 'No results');
    console.log('Fetched potential contacts:', potentialContacts.length, 'users found');
    console.log('****potential contacts:', JSON.stringify(potentialContacts, null, 2));
    console.log('=== /potentialcontact END ===');

    res.json({
      success: true,
      data: potentialContacts,
      count: potentialContacts.length
    });

  } catch (error) {
    console.error('=== /potentialcontact ERROR ===');
    console.error('Error details:', error);
    console.error('Error stack:', error.stack);
    console.error('=== /potentialcontact ERROR END ===');
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/connections/{connectionId}/accept:
 *   put:
 *     summary: Accept a connection request with comprehensive validation and logging
 *     description: |
 *       Accepts a pending connection request or proposal. The user must be the recipient
 *       (for friend requests or career agent proposals) or the candidate (for career agent requests).
 *       Updates the relationship status to 'active' and sets the start date.
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: connectionId
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: MongoDB ObjectId of the connection to accept
 *     responses:
 *       200:
 *         description: Connection accepted successfully
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
 *                   $ref: '#/components/schemas/Connection'
 *       400:
 *         description: Invalid connection ID format or connection cannot be accepted in current state
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid connection ID"
 *       403:
 *         description: User not authorized to accept this connection
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Not authorized to accept this connection"
 *       404:
 *         description: Connection not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Connection not found"
 *       401:
 *         description: Unauthorized - invalid or missing JWT token
 *       500:
 *         description: Internal server error with detailed logging
 */
router.put('/:connectionId/accept', verifyToken, async (req, res) => {
  try {
    console.log('=== /accept CONNECTION START ===');
    console.log('Received request to accept connection:', req.params);
    console.log('User ID:', req.user.userId);
    console.log('Request body:', req.body);

    const { connectionId } = req.params;
    const userId = req.user.userId;

    console.log('Validating connection ID:', connectionId);
    if (!mongoose.Types.ObjectId.isValid(connectionId)) {
      console.log('Invalid connection ID format');
      return res.status(400).json({
        success: false,
        message: 'Invalid connection ID'
      });
    }

    console.log('Finding connection by ID...');
    const connection = await Connection.findById(connectionId);
    console.log('Connection found:', connection ? 'Yes' : 'No');
    console.log('Connection details:', connection ? JSON.stringify(connection, null, 2) : 'N/A');
    
    if (!connection) {
      console.log('Connection not found in database');
      return res.status(404).json({
        success: false,
        message: 'Connection not found'
      });
    }

    console.log('Checking user authorization...');
    console.log('Current user ID:', userId);
    console.log('Connection recipientUserId:', connection.recipientUserId);
    console.log('Connection candidateId:', connection.candidateId);
    
    // Check if user is authorized to accept (must be recipient or candidate)
    const isRecipient = connection.recipientUserId === userId;
    const isCandidate = connection.candidateId === userId;
    console.log('User is recipient:', isRecipient);
    console.log('User is candidate:', isCandidate);
    
    if (!isRecipient && !isCandidate) {
      console.log('User not authorized to accept this connection');
      return res.status(403).json({
        success: false,
        message: 'Not authorized to accept this connection'
      });
    }

    console.log('Checking connection status...');
    console.log('Current relationship status:', connection.relationshipStatus);
    const acceptableStatuses = ['requested', 'proposed', 'pending'];
    console.log('Acceptable statuses:', acceptableStatuses);
    
    // Check if connection is in a state that can be accepted
    if (!acceptableStatuses.includes(connection.relationshipStatus)) {
      console.log('Connection cannot be accepted in current state');
      return res.status(400).json({
        success: false,
        message: 'Connection cannot be accepted in its current state'
      });
    }

    console.log('Updating connection status to active...');
    const oldStatus = connection.relationshipStatus;
    // Update connection status
    connection.relationshipStatus = 'active';
    connection.startDate = new Date();
    await connection.save();
    console.log('Connection updated successfully');
    console.log('Status changed from:', oldStatus, 'to:', connection.relationshipStatus);
    console.log('Start date set to:', connection.startDate);

    console.log('Populating connection with user details...');
    // Populate and return
    const populatedConnection = await Connection.findById(connectionId)
      .populate('requestor')
      .populate('recipient')
      .populate('careerAgent')
      .populate('candidate');
    
    console.log('Population completed');
    console.log('Populated connection:', JSON.stringify(populatedConnection, null, 2));
    console.log('=== /accept CONNECTION SUCCESS ===');

    res.json({
      success: true,
      message: 'Connection accepted successfully',
      data: populatedConnection
    });

  } catch (error) {
    console.error('=== /accept CONNECTION ERROR ===');
    console.error('Error details:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Connection ID:', req.params?.connectionId);
    console.error('User ID:', req.user?.userId);
    console.error('=== /accept CONNECTION ERROR END ===');
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/connections/{connectionId}/reject:
 *   put:
 *     summary: Reject a connection request with validation and optional reason
 *     description: |
 *       Rejects a pending connection request or proposal. The user must be the recipient
 *       (for friend requests or career agent proposals) or the candidate (for career agent requests).
 *       Updates the relationship status to 'rejected' and optionally updates the message.
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: connectionId
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: MongoDB ObjectId of the connection to reject
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *                 description: Optional reason for rejection
 *                 example: "Thank you for the request, but I'm not looking for new connections at this time."
 *     responses:
 *       200:
 *         description: Connection rejected successfully
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
 *                   $ref: '#/components/schemas/Connection'
 *       400:
 *         description: Invalid connection ID format
 *       403:
 *         description: User not authorized to reject this connection
 *       404:
 *         description: Connection not found
 *       401:
 *         description: Unauthorized - invalid or missing JWT token
 *       500:
 *         description: Internal server error
 */
router.put('/:connectionId/reject', verifyToken, async (req, res) => {
  try {
    const { connectionId } = req.params;
    const userId = req.user.userId;
    const { message } = req.body;

    if (!mongoose.Types.ObjectId.isValid(connectionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid connection ID'
      });
    }

    const connection = await Connection.findById(connectionId);
    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Connection not found'
      });
    }

    // Check if user is authorized to reject (must be recipient or candidate)
    if (connection.recipientUserId !== userId && connection.candidateId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to reject this connection'
      });
    }

    // Update connection status
    connection.relationshipStatus = 'rejected';
    if (message) {
      connection.message = message;
    }
    await connection.save();

    // Populate and return
    const populatedConnection = await Connection.findById(connectionId)
      .populate('requestor')
      .populate('recipient')
      .populate('careerAgent')
      .populate('candidate');

    res.json({
      success: true,
      message: 'Connection rejected successfully',
      data: populatedConnection
    });

  } catch (error) {
    console.error('Error rejecting connection:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/connections/{connectionId}:
 *   put:
 *     summary: Update connection relationship with comprehensive validation
 *     description: |
 *       Updates an existing connection relationship. The user must be part of the connection
 *       (as requestor, recipient, career agent, or candidate). Can update relationship status,
 *       message, and end date.
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: connectionId
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: MongoDB ObjectId of the connection to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               relationshipStatus:
 *                 type: string
 *                 enum: [active, inactive, pending, proposed, requested, rejected]
 *                 description: New relationship status
 *               message:
 *                 type: string
 *                 description: Updated message or note about the relationship
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 description: When the relationship ended (for inactive status)
 *             example:
 *               relationshipStatus: "inactive"
 *               message: "Professional relationship concluded"
 *               endDate: "2024-12-31T23:59:59.999Z"
 *     responses:
 *       200:
 *         description: Connection updated successfully
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
 *                   $ref: '#/components/schemas/Connection'
 *       400:
 *         description: Invalid connection ID format
 *       403:
 *         description: User not authorized to update this connection
 *       404:
 *         description: Connection not found
 *       401:
 *         description: Unauthorized - invalid or missing JWT token
 *       500:
 *         description: Internal server error
 */
router.put('/:connectionId', verifyToken, async (req, res) => {
  try {
    const { connectionId } = req.params;
    const userId = req.user.userId;
    const { relationshipStatus, message, endDate } = req.body;

    if (!mongoose.Types.ObjectId.isValid(connectionId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid connection ID'
      });
    }

    const connection = await Connection.findById(connectionId);
    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Connection not found'
      });
    }

    // Check if user is part of this connection
    const isPartOfConnection = [
      connection.requestorUserId,
      connection.recipientUserId,
      connection.careerAgentId,
      connection.candidateId
    ].includes(userId);

    if (!isPartOfConnection) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this connection'
      });
    }

    // Update fields
    if (relationshipStatus) connection.relationshipStatus = relationshipStatus;
    if (message !== undefined) connection.message = message;
    if (endDate) connection.endDate = new Date(endDate);

    await connection.save();

    // Populate and return
    const populatedConnection = await Connection.findById(connectionId)
      .populate('requestor')
      .populate('recipient')
      .populate('careerAgent')
      .populate('candidate');

    res.json({
      success: true,
      message: 'Connection updated successfully',
      data: populatedConnection
    });

  } catch (error) {
    console.error('Error updating connection:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/connections/candidates:
 *   get:
 *     summary: Get all candidate IDs for whom the current user is a career agent
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of candidate IDs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 candidateIds:
 *                   type: array
 *                   items:
 *                     type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/candidates', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    // Find all connections where the requester is the career agent
    const connections = await Connection.find({
      careerAgentId: userId
    }, 'candidateId');

    


    // Extract unique candidateIds
    const candidateIds = connections
      .map(conn => conn.candidateId)
      .filter(id => !!id);

    console.log('Unique Candidate IDs:', candidateIds);

    res.json({
      success: true,
      candidateIds
    });
  } catch (error) {
    console.error('Error fetching candidate IDs:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/connections/careeragent/relationship:
 *   get:
 *     summary: Get the career agent relationship with a specific user
 *     description: |
 *       Returns the connection record where the current user is the career agent and the specified user is the candidate.
 *     tags: [Connections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: forUserId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID of the candidate
 *     responses:
 *       200:
 *         description: Career agent relationship found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Connection'
 *       400:
 *         description: Missing forUserId parameter
 *       404:
 *         description: Relationship not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/careeragent/relationship', verifyToken, async (req, res) => {
  try {
    const careerAgentId = req.user.userId;
    const { forUserId } = req.query;

    if (!forUserId) {
      return res.status(400).json({
        success: false,
        message: 'forUserId query parameter is required'
      });
    }

    const connection = await Connection.findOne({
      connectionType: 'careerAgent',
      careerAgentId,
      candidateId: forUserId
    })
      .populate('requestor')
      .populate('recipient')
      .populate('careerAgent')
      .populate('candidate');

    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Career agent relationship not found'
      });
    }

    res.json({
      success: true,
      data: connection
    });
  } catch (error) {
    console.error('Error fetching career agent relationship:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;
