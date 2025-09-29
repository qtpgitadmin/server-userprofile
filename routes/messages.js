import express from 'express';
const router = express.Router();
import { body, validationResult } from 'express-validator';
import Message from '../models/Conversation.js';
import UserProfile from '../models/UserProfile.js';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

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

// Validation for creating conversation
const validateCreateConversation = [
  body('to_userId').trim().isLength({ min: 1 }).withMessage('Recipient user ID is required'),
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title is required and must be less than 200 characters'),
  body('content').trim().isLength({ min: 1, max: 5000 }).withMessage('Message content is required and must be less than 5000 characters'),
  body('conversationType').optional().isIn(['job', 'resume', 'post', 'general']).withMessage('Invalid conversation type'),
  body('jobContext.jobId').optional().trim(),
  body('resumeContext.resumeId').optional().trim(),
  body('postContext.postId').optional().trim(),
  
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

// Validation for sending message
const validateSendMessage = [
  body('content').trim().isLength({ min: 1, max: 5000 }).withMessage('Message content is required and must be less than 5000 characters'),
  
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
 *     Message:
 *       type: object
 *       properties:
 *         conversationId:
 *           type: string
 *           description: Unique identifier of the conversation
 *         from_userId:
 *           type: string
 *           description: User ID of the conversation initiator
 *         title:
 *           type: string
 *           description: Title or subject of the conversation
 *         messages:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               from_userId:
 *                 type: string
 *               to_userId:
 *                 type: string
 *               content:
 *                 type: string
 *               data:
 *                 type: object
 *                 properties:
 *                   timestamp:
 *                     type: string
 *                     format: date-time
 *                   readAt:
 *                     type: string
 *                     format: date-time
 *         conversationType:
 *           type: string
 *           enum: [job, resume, post, general]
 *         participants:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *               role:
 *                 type: string
 *               lastReadAt:
 *                 type: string
 *                 format: date-time
 */

/**
 * @swagger
 * /api/messages/conversations:
 *   post:
 *     summary: Create a new conversation
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to_userId
 *               - title
 *               - content
 *             properties:
 *               to_userId:
 *                 type: string
 *                 description: Recipient user ID
 *               title:
 *                 type: string
 *                 description: Conversation title
 *               content:
 *                 type: string
 *                 description: First message content
 *               conversationType:
 *                 type: string
 *                 enum: [job, resume, post, general]
 *                 default: general
 *               jobContext:
 *                 type: object
 *                 properties:
 *                   jobId:
 *                     type: string
 *                   jobTitle:
 *                     type: string
 *                   companyName:
 *                     type: string
 *               resumeContext:
 *                 type: object
 *                 properties:
 *                   resumeId:
 *                     type: string
 *                   resumeName:
 *                     type: string
 *                   candidateUserId:
 *                     type: string
 *               postContext:
 *                 type: object
 *                 properties:
 *                   postId:
 *                     type: string
 *                   postTitle:
 *                     type: string
 *                   postType:
 *                     type: string
 *     responses:
 *       201:
 *         description: Conversation created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/conversations', verifyToken, validateCreateConversation, async (req, res) => {
  try {
    const { to_userId, title, content, conversationType = 'general', jobContext, resumeContext, postContext } = req.body;
    const from_userId = req.user.userId;

    console.log('Creating conversation:', { from_userId, to_userId, title, conversationType });

    // Check if recipient exists
    const recipientProfile = await UserProfile.findOne({ userId: to_userId });
    if (!recipientProfile) {
      return res.status(404).json({
        success: false,
        message: 'Recipient user not found'
      });
    }

    // Generate conversation ID based on participants and context
    const contextId = jobContext?.jobId || resumeContext?.resumeId || postContext?.postId;
    const conversationId = Message.generateConversationId(from_userId, to_userId, conversationType, contextId);

    // Check if conversation already exists
    let conversation = await Message.findOne({ conversationId });
    
    if (conversation) {
      // Add message to existing conversation
      const newMessage = conversation.addMessage({
        from_userId,
        to_userId,
        content
      });
      
      await conversation.save();
      
      return res.status(200).json({
        success: true,
        message: 'Message added to existing conversation',
        data: conversation,
        newMessage
      });
    }

    // Create new conversation
    conversation = new Message({
      from_userId,
      title,
      conversationId,
      conversationType,
      jobContext: jobContext || {},
      resumeContext: resumeContext || {},
      postContext: postContext || {},
      participants: [
        { userId: from_userId, role: 'sender' },
        { userId: to_userId, role: 'recipient' }
      ],
      messages: []
    });

    // Add first message
    conversation.addMessage({
      from_userId,
      to_userId,
      content
    });

    await conversation.save();

    console.log('Conversation created successfully:', conversationId);

    res.status(201).json({
      success: true,
      message: 'Conversation created successfully',
      data: conversation
    });

  } catch (error) {
    console.error('Error creating conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/messages/conversations/{conversationId}/messages:
 *   post:
 *     summary: Send a message in an existing conversation
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: Message content
 *               to_userId:
 *                 type: string
 *                 description: Recipient user ID (optional, will use conversation participants)
 *     responses:
 *       201:
 *         description: Message sent successfully
 *       404:
 *         description: Conversation not found
 *       403:
 *         description: Not authorized to send message in this conversation
 */
router.post('/conversations/:conversationId/messages', verifyToken, validateSendMessage, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, to_userId } = req.body;
    const from_userId = req.user.userId;

    console.log('Sending message to conversation:', conversationId);

    const conversation = await Message.findOne({ conversationId });
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Check if user is participant in conversation
    const isParticipant = conversation.participants.some(p => p.userId === from_userId);
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to send messages in this conversation'
      });
    }

    // Determine recipient
    let recipientUserId = to_userId;
    if (!recipientUserId) {
      // Find the other participant
      const otherParticipant = conversation.participants.find(p => p.userId !== from_userId);
      recipientUserId = otherParticipant?.userId;
    }

    if (!recipientUserId) {
      return res.status(400).json({
        success: false,
        message: 'Could not determine message recipient'
      });
    }

    // Add message to conversation
    const newMessage = conversation.addMessage({
      from_userId,
      to_userId: recipientUserId,
      content
    });

    await conversation.save();

    console.log('Message sent successfully:', newMessage.id);

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: newMessage,
      conversation: {
        conversationId: conversation.conversationId,
        lastActivity: conversation.lastActivity
      }
    });

  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/messages/conversations:
 *   get:
 *     summary: Get all conversations for current user
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [job, resume, post, general]
 *         description: Filter by conversation type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of conversations to return
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *     responses:
 *       200:
 *         description: Conversations retrieved successfully
 */
router.get('/conversations', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { type, limit = 20, page = 1 } = req.query;

    console.log('Fetching conversations for user:', userId);

    // Build query
    const query = {
      'participants.userId': userId,
      isActive: true
    };

    if (type) {
      query.conversationType = type;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const conversations = await Message.find(query)
      .sort({ lastActivity: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .populate('participants.userId', 'firstName lastName profilePictureUrl', 'UserProfile');

    // Get total count for pagination
    const total = await Message.countDocuments(query);

    // Add unread count for each conversation
    const conversationsWithUnread = conversations.map(conv => {
      const unreadMessages = conv.getUnreadMessages(userId);
      return {
        ...conv.toObject(),
        unreadCount: unreadMessages.length,
        lastMessage: conv.messages.length > 0 ? conv.messages[conv.messages.length - 1] : null
      };
    });

    res.json({
      success: true,
      data: conversationsWithUnread,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/messages/conversations/{conversationId}:
 *   get:
 *     summary: Get a specific conversation with all messages
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Conversation retrieved successfully
 *       404:
 *         description: Conversation not found
 *       403:
 *         description: Not authorized to view this conversation
 */
router.get('/conversations/:conversationId', verifyToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.userId;

    console.log('Fetching conversation:', conversationId);

    const conversation = await Message.findOne({ conversationId })
      .populate('participants.userId', 'firstName lastName profilePictureUrl', 'UserProfile');

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Check if user is participant
    const isParticipant = conversation.participants.some(p => p.userId === userId);
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this conversation'
      });
    }

    // Mark messages as read for current user
    conversation.markAsRead(userId);
    await conversation.save();

    res.json({
      success: true,
      data: conversation
    });

  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/messages/conversations/{conversationId}/read:
 *   put:
 *     summary: Mark messages as read
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               messageIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Specific message IDs to mark as read (optional)
 *     responses:
 *       200:
 *         description: Messages marked as read successfully
 */
router.put('/conversations/:conversationId/read', verifyToken, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { messageIds = [] } = req.body;
    const userId = req.user.userId;

    const conversation = await Message.findOne({ conversationId });
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found'
      });
    }

    // Check if user is participant
    const isParticipant = conversation.participants.some(p => p.userId === userId);
    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to modify this conversation'
      });
    }

    conversation.markAsRead(userId, messageIds);
    await conversation.save();

    res.json({
      success: true,
      message: 'Messages marked as read successfully'
    });

  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/messages/unread-count:
 *   get:
 *     summary: Get total unread message count for current user
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count retrieved successfully
 */
router.get('/unread-count', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const conversations = await Message.find({
      'participants.userId': userId,
      isActive: true
    });

    let totalUnread = 0;
    conversations.forEach(conv => {
      const unreadMessages = conv.getUnreadMessages(userId);
      totalUnread += unreadMessages.length;
    });

    res.json({
      success: true,
      data: {
        unreadCount: totalUnread
      }
    });

  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @swagger
 * /api/messages/search:
 *   get:
 *     summary: Search messages and conversations
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [job, resume, post, general]
 *         description: Filter by conversation type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of results to return
 *     responses:
 *       200:
 *         description: Search results retrieved successfully
 */
router.get('/search', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { q, type, limit = 20 } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    console.log('Searching messages for user:', userId, 'query:', q);

    // Build search query
    const searchQuery = {
      'participants.userId': userId,
      isActive: true,
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { 'messages.content': { $regex: q, $options: 'i' } }
      ]
    };

    if (type) {
      searchQuery.conversationType = type;
    }

    const conversations = await Message.find(searchQuery)
      .sort({ lastActivity: -1 })
      .limit(parseInt(limit))
      .populate('participants.userId', 'firstName lastName profilePictureUrl', 'UserProfile');

    // Highlight matching messages
    const results = conversations.map(conv => {
      const matchingMessages = conv.messages.filter(msg => 
        msg.content.toLowerCase().includes(q.toLowerCase())
      );

      return {
        ...conv.toObject(),
        matchingMessages: matchingMessages.slice(0, 3), // Show up to 3 matching messages
        totalMatches: matchingMessages.length
      };
    });

    res.json({
      success: true,
      data: results,
      searchQuery: q,
      totalResults: results.length
    });

  } catch (error) {
    console.error('Error searching messages:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;