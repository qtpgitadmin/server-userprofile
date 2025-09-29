import express from 'express';
const router = express.Router();
import UserCoverLetter from '../models/CoverLetter.js';
import jwt from 'jsonwebtoken';



/**
 * Middleware to verify JWT token (copied from resume.js)
 */
const verifyToken = (req, res, next) => {
  console.log('Verifying token for request to:', req.originalUrl);
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    console.log('No token provided');
    return res.status(401).json({
      success: false,
      message: 'Access token required'
    });
  }
  try {
    console.log('JWT_SECRET:', process.env.JWT_SECRET);
    console.log('Token:', token);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded:', decoded);
    req.user = decoded;
    console.log('Token verified for user:', req.user.userId);
    next();
  } catch (error) {
    console.log('Token verification failed:', error.message);
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
 *     CoverLetter:
 *       type: object
 *       required:
 *         - fromUserId
 *         - forUserId
 *         - title
 *         - text
 *         - createdAt
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the cover letter
 *         fromUserId:
 *           type: string
 *           description: The ID of the user who created the cover letter
 *         forUserId:
 *           type: string
 *           description: The ID of the user for whom the cover letter is saved
 *         title:
 *           type: string
 *           description: Title of the cover letter
 *         text:
 *           type: string
 *           description: Main body or content of the cover letter
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Creation timestamp
 */

/**
 * @swagger
 * /api/coverletter:
 *   post:
 *     summary: Create a new cover letter
 *     tags: [CoverLetter]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CoverLetter'
 *     responses:
 *       201:
 *         description: Cover letter created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post('/', verifyToken, async (req, res) => {
  try {
    console.log('Request Body:', req.body);
    const coverLetter = new UserCoverLetter(req.body);
    console.log('New Cover Letter:', coverLetter);
    await coverLetter.save();
    res.status(201).json({ success: true, data: coverLetter });
  } catch (err) {
    console.log('Create CoverLetter failed with Error:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * @swagger
 * /api/coverletter/user/{userId}:
 *   get:
 *     summary: Get all cover letters for a user
 *     tags: [CoverLetter]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to get cover letters for
 *     responses:
 *       200:
 *         description: Cover letters retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/user/:userId', verifyToken, async (req, res) => {
  try {
    console.log('Fetching cover letters for userId:', req.params.userId, 'requested by:', req.user.userId);
    const coverLetters = await UserCoverLetter.find({
    forUserId: req.params.userId,
    fromUserId: req.user.userId
    });
    console.log(`Found ${coverLetters.length} cover letters`); 
    res.json({ success: true, data: coverLetters });
  } catch (err) {
    console.log('Fetch CoverLetters failed with Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @swagger
 * /api/coverletter/{id}:
 *   get:
 *     summary: Get a specific cover letter by ID
 *     tags: [CoverLetter]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Cover letter ID
 *     responses:
 *       200:
 *         description: Cover letter retrieved successfully
 *       404:
 *         description: Not found
 *       401:
 *         description: Unauthorized
 */
router.get('/:id', verifyToken, async (req, res) => {
  try {
    // Find cover letter by id and ensure the requester is either the owner or the agent
    const coverLetter = await UserCoverLetter.findOne({
      _id: req.params.id,
      $or: [
        { forUserId: req.user.userId },
        { fromUserId: req.user.userId }
      ]
    });
    if (!coverLetter) {
      return res.status(404).json({ success: false, error: 'Not found or forbidden as the requester is not the owner or career agent' });
    }
    return res.json({ success: true, data: coverLetter });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * @swagger
 * /api/coverletter/{id}:
 *   put:
 *     summary: Update a cover letter
 *     tags: [CoverLetter]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Cover letter ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CoverLetter'
 *     responses:
 *       200:
 *         description: Cover letter updated successfully
 *       404:
 *         description: Not found
 *       401:
 *         description: Unauthorized
 */
router.put('/:id', verifyToken, async (req, res) => {
  try {


    const coverLetter = await UserCoverLetter.findOneAndUpdate(
    {
        _id: req.params.id,
        $or: [
        { forUserId: req.user.userId },
        { fromUserId: req.user.userId }
        ]
    },
    req.body,
    { new: true, runValidators: true }
    );
    if (!coverLetter) return res.status(404).json({ success: false, error: 'Not found or forbidden as the requester is not the owner or career agent' });
    res.json({ success: true, data: coverLetter });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * @swagger
 * /api/coverletter/{id}:
 *   delete:
 *     summary: Delete a cover letter
 *     tags: [CoverLetter]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Cover letter ID
 *     responses:
 *       200:
 *         description: Cover letter deleted successfully
 *       404:
 *         description: Not found
 *       401:
 *         description: Unauthorized
 */
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const result = await UserCoverLetter.findOneAndDelete({
    _id: req.params.id,
    $or: [
        { forUserId: req.user.userId },
        { fromUserId: req.user.userId }
    ]
    });
    if (!result) return res.status(404).json({ success: false, error: 'Not found or forbidden as the requester is not the owner or career agent' });
    res.json({ success: true, message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


export default router;