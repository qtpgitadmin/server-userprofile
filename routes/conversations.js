import express from 'express';
import Conversation from '../models/Conversation.js';
import { v4 as uuidv4 } from 'uuid';
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


/**
 * @swagger
 * components:
 *   schemas:
 *     Participant:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         userId:
 *           type: string
 *         firstName:
 *           type: string
 *         lastName:
 *           type: string
 *         joined_at:
 *           type: string
 *           format: date-time
 *         left_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         history_window:
 *           type: string
 *           description: "ALL, NONE, or DAYS_N"
 *     Message:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         sender_id:
 *           type: string
 *         content:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         visible_to:
 *           type: array
 *           items:
 *             type: string
 *     Conversation:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         title:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         history_window:
 *           type: string
 *         participants:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Participant'
 *         messages:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Message'
 *         context:
 *           type: object
 *           properties:
 *             jobId:
 *               type: string
 *             postId:
 *               type: string
 *             resumeId:
 *               type: string
 */

/**
 * @swagger
 * /api/conversations:
 *   post:
 *     summary: Create a new conversation session
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               participants:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/Participant'
 *               history_window:
 *                 type: string
 *               context:
 *                 type: object
 *                 properties:
 *                   jobId:
 *                     type: string
 *                   postId:
 *                     type: string
 *                   resumeId:
 *                     type: string
 *     responses:
 *       201:
 *         description: Conversation created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Conversation'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/', verifyToken, async (req, res) => {
  try {
    const { title, participants, history_window, context } = req.body;
    const id = uuidv4();
    const created_at = new Date().toISOString();

    // Add joined_at to each participant
    const participantsWithJoin = (participants || []).map(p => ({
      ...p,
      id: p.id || uuidv4(),
      joined_at: p.joined_at || created_at,
      left_at: null
    }));

    const conversation = new Conversation({
      id,
      title,
      created_at,
      history_window,
      participants: participantsWithJoin,
      messages: [],
      context
    });

    await conversation.save();
    res.status(201).json({ success: true, data: conversation });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * @swagger
 * /api/conversations/{id}/messages:
 *   post:
 *     summary: Add a message to a conversation
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Message'
 *       404:
 *         description: Conversation not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/:id/messages', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const sender_id = req.user.userId;
    const message = {
      id: uuidv4(),
      sender_id,
      content,
      created_at: new Date().toISOString()
    };

    const conversation = await Conversation.findOneAndUpdate(
      { id },
      { $push: { messages: message } },
      { new: true }
    );
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
    res.json({ success: true, data: message });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * @swagger
 * /api/conversations/{id}/messages/{messageId}:
 *   put:
 *     summary: Update a message in a conversation
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *         description: Message ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Message'
 *       404:
 *         description: Conversation or message not found
 *       403:
 *         description: Not allowed
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put('/:id/messages/:messageId', verifyToken, async (req, res) => {
  try {
    const { id, messageId } = req.params;
    const { content } = req.body;
    const conversation = await Conversation.findOne({ id });
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });

    const msg = conversation.messages.find(m => m.id === messageId);
    if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });
    if (msg.sender_id !== req.user.userId) return res.status(403).json({ success: false, message: 'Not allowed' });

    msg.content = content;
    await conversation.save();
    res.json({ success: true, data: msg });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * @swagger
 * /api/conversations/{id}/messages/{messageId}:
 *   delete:
 *     summary: Delete a message from a conversation
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema:
 *           type: string
 *         description: Message ID
 *     responses:
 *       200:
 *         description: Message deleted successfully
 *       404:
 *         description: Conversation or message not found
 *       403:
 *         description: Not allowed
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.delete('/:id/messages/:messageId', verifyToken, async (req, res) => {
  try {
    const { id, messageId } = req.params;
    const conversation = await Conversation.findOne({ id });
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });

    const msgIndex = conversation.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return res.status(404).json({ success: false, message: 'Message not found' });
    if (conversation.messages[msgIndex].sender_id !== req.user.userId) return res.status(403).json({ success: false, message: 'Not allowed' });

    conversation.messages.splice(msgIndex, 1);
    await conversation.save();
    res.json({ success: true, message: 'Message deleted' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * @swagger
 * /api/conversations/{id}/participants:
 *   post:
 *     summary: Add a participant to a conversation
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Participant'
 *     responses:
 *       200:
 *         description: Participant added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Participant'
 *       404:
 *         description: Conversation not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/:id/participants', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const participant = {
      ...req.body,
      id: uuidv4(),
      joined_at: new Date().toISOString(),
      left_at: null
    };
    const conversation = await Conversation.findOneAndUpdate(
      { id },
      { $push: { participants: participant } },
      { new: true }
    );
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });
    res.json({ success: true, data: participant });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * @swagger
 * /api/conversations/{id}/participants/{participantId}:
 *   delete:
 *     summary: Remove a participant from a conversation
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID
 *       - in: path
 *         name: participantId
 *         required: true
 *         schema:
 *           type: string
 *         description: Participant ID
 *     responses:
 *       200:
 *         description: Participant removed successfully
 *       404:
 *         description: Conversation or participant not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.delete('/:id/participants/:participantId', verifyToken, async (req, res) => {
  try {
    const { id, participantId } = req.params;
    const conversation = await Conversation.findOne({ id });
    if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });

    const partIndex = conversation.participants.findIndex(p => p.id === participantId);
    if (partIndex === -1) return res.status(404).json({ success: false, message: 'Participant not found' });

    conversation.participants.splice(partIndex, 1);
    await conversation.save();
    res.json({ success: true, message: 'Participant removed' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * @swagger
 * /api/conversations/user/{userId}:
 *   get:
 *     summary: Get all conversations where the user is or was a participant (without messages)
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: List of conversations (messages excluded)
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
 *                     $ref: '#/components/schemas/Conversation'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/user/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    // Find conversations where any participant has userId, exclude messages
    // const conversations = await Conversation.find(
    //   { 'participants.userId': userId },
    //   { messages: 0, _id: 0, __v: 0 }
    // );
    // console.log(`Found ${conversations.length} conversations for user ${userId}`);  
    // console.log(conversations);
     const conversations = await Conversation.find(
      { 'participants.userId': userId },
      { _id: 0, __v: 0 }
    );

    // For each conversation, include only the first message (if any)
    const conversationsWithFirstMessage = conversations.map(conv => {
      const obj = conv.toObject ? conv.toObject() : conv;
      return {
        ...obj,
        messages: Array.isArray(obj.messages) && obj.messages.length > 0
          ? [obj.messages[0]]
          : []
      };
    });
    console.log(`Returning ${conversationsWithFirstMessage.length} conversations with first messages for user ${userId}`);
    console.log(conversationsWithFirstMessage);
    res.json({ success: true, data: conversationsWithFirstMessage });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

/**
 * @swagger
 * /api/conversations/{id}/messages/user/{userId}:
 *   get:
 *     summary: Get messages for a conversation relevant to a participant (user)
 *     tags: [Conversations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Conversation ID
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID (participant)
 *     responses:
 *       200:
 *         description: List of messages relevant to the user
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
 *                     $ref: '#/components/schemas/Message'
 *       404:
 *         description: Conversation or participant not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/:id/messages/user/:userId', verifyToken, async (req, res) => {
  try {
    const { id, userId } = req.params;
    const conversation = await Conversation.findOne({ id });
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    // Find the participant record for this user
    const participant = conversation.participants.find(p => p.userId === userId);
    if (!participant) {
      return res.status(404).json({ success: false, message: 'Participant not found in conversation' });
    }

    // Determine message window
    let fromDate = null;
    let toDate = null;
    const joinedAt = new Date(participant.joined_at);
    const leftAt = participant.left_at ? new Date(participant.left_at) : null;
    const historyWindow = (participant.history_window || '').toUpperCase();

    if (historyWindow === 'ALL') {
      fromDate = new Date(conversation.created_at);
    } else if (historyWindow === 'NONE') {
      fromDate = joinedAt;
    } else if (historyWindow.startsWith('DAYS_')) {
      const days = parseInt(historyWindow.replace('DAYS_', ''), 10);
      if (!isNaN(days)) {
        fromDate = new Date(joinedAt.getTime() - days * 24 * 60 * 60 * 1000);
      } else {
        fromDate = joinedAt;
      }
    } else {
      // Default fallback: from when user joined
      fromDate = joinedAt;
    }

    toDate = leftAt || new Date();

    // Filter messages based on window
    const filteredMessages = (conversation.messages || []).filter(msg => {
      const msgDate = new Date(msg.created_at);
      return msgDate >= fromDate && msgDate <= toDate;
    });

    res.json({ success: true, data: filteredMessages });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;