import request from 'supertest';
import app from '../app.js';
import mongoose from 'mongoose';
import CareerAgent from '../models/CareerAgent.js';
import UserProfile from '../models/UserProfile.js';

describe('Career Agent API', () => {
  let authToken;
  let careerAgentProfile;
  let candidateProfile;

  beforeAll(async () => {
    // This would typically be set up with proper test authentication
    authToken = 'test-jwt-token';
    
    // Create test user profiles
    careerAgentProfile = await UserProfile.create({
      userId: 'agent123',
      firstName: 'John',
      lastName: 'Agent',
      headline: 'Career Coach',
      industry: 'Human Resources'
    });

    candidateProfile = await UserProfile.create({
      userId: 'candidate123',
      firstName: 'Jane',
      lastName: 'Candidate',
      headline: 'Software Developer',
      industry: 'Technology'
    });
  });

  afterAll(async () => {
    await CareerAgent.deleteMany({});
    await UserProfile.deleteMany({});
    await mongoose.connection.close();
  });

  describe('POST /api/careeragent', () => {
    it('should create a career agent relationship', async () => {
      const relationshipData = {
        careerAgentId: 'agent123',
        candidateId: 'candidate123',
        message: 'Initial career guidance relationship',
        relationshipStatus: 'active'
      };

      const response = await request(app)
        .post('/api/careeragent')
        .set('Authorization', `Bearer ${authToken}`)
        .send(relationshipData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.careerAgentId).toBe('agent123');
      expect(response.body.data.candidateId).toBe('candidate123');
    });

    it('should prevent duplicate candidate assignments', async () => {
      const relationshipData = {
        careerAgentId: 'agent456',
        candidateId: 'candidate123', // Same candidate as above
        message: 'Attempting duplicate assignment'
      };

      const response = await request(app)
        .post('/api/careeragent')
        .set('Authorization', `Bearer ${authToken}`)
        .send(relationshipData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already has');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/careeragent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/careeragent/agent/:careerAgentId', () => {
    it('should retrieve candidates for a career agent', async () => {
      const response = await request(app)
        .get('/api/careeragent/agent/agent123')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /api/careeragent/candidate/:candidateId', () => {
    it('should retrieve career agent for a candidate', async () => {
      const response = await request(app)
        .get('/api/careeragent/candidate/candidate123')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.candidateId).toBe('candidate123');
    });
  });

  describe('GET /api/careeragent/stats/agent/:careerAgentId', () => {
    it('should retrieve statistics for a career agent', async () => {
      const response = await request(app)
        .get('/api/careeragent/stats/agent/agent123')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalCandidates');
      expect(response.body.data).toHaveProperty('activeCandidates');
    });
  });
});
