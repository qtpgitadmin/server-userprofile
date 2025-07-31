# Career Agent Management API

This module manages the relationship between career agents and candidates in the Dintak platform.

## Overview

The Career Agent system allows for a one-to-many relationship where:
- A career agent can have multiple candidates
- Each candidate can only have one active career agent at a time
- Relationships can have different statuses: active, inactive, pending

## Database Schema

### CareerAgent Model
```javascript
{
  id: ObjectId,                    // Unique identifier
  careerAgentId: String,           // User ID of the career agent (can be repeated)
  candidateId: String,             // User ID of the candidate (must be unique)
  relationshipStatus: String,      // 'active', 'inactive', 'pending'
  startDate: Date,                 // When relationship started
  endDate: Date,                   // When relationship ended (null if active)
  message: String,                   // Additional message (max 1000 chars)
  createdAt: Date,                 // Auto-generated
  updatedAt: Date                  // Auto-generated
}
```

## API Endpoints

### 1. Create Career Agent Relationship
**POST** `/api/careeragent`

Creates a new relationship between a career agent and candidate.

**Request Body:**
```json
{
  "careerAgentId": "agent_user_id",
  "candidateId": "candidate_user_id",
  "message": "Optional message about the relationship",
  "relationshipStatus": "active"
}
```

**Validation Rules:**
- Both `careerAgentId` and `candidateId` are required
- Career agent and candidate must be different users
- Both users must have existing profiles
- Candidate cannot already have an active career agent

### 2. Get Candidates for Career Agent
**GET** `/api/careeragent/agent/{careerAgentId}`

Retrieves all candidates assigned to a specific career agent.

**Query Parameters:**
- `status` (optional): Filter by relationship status
- `limit` (optional): Maximum number of results (default: 50)

### 3. Get Career Agent for Candidate
**GET** `/api/careeragent/candidate/{candidateId}`

Retrieves the career agent assigned to a specific candidate.

### 4. Update Relationship
**PUT** `/api/careeragent/{relationshipId}`

Updates an existing career agent relationship.

**Request Body:**
```json
{
  "relationshipStatus": "inactive",
  "message": "Updated message",
  "endDate": "2025-01-01T00:00:00.000Z"
}
```

### 5. Delete Relationship
**DELETE** `/api/careeragent/{relationshipId}`

Permanently deletes a career agent relationship.

### 6. Get Career Agent Statistics
**GET** `/api/careeragent/stats/agent/{careerAgentId}`

Retrieves statistics for a career agent including:
- Total candidates
- Active candidates
- Pending candidates
- Inactive candidates

## Business Rules

1. **Unique Candidate Assignment**: Each candidate can only have one active career agent at any time.

2. **Multiple Candidates per Agent**: A career agent can have unlimited candidates assigned.

3. **Status Management**: 
   - `active`: Current working relationship
   - `pending`: Relationship requested but not confirmed
   - `inactive`: Relationship ended

4. **Data Integrity**: Both career agent and candidate must exist as user profiles before creating a relationship.

## Error Handling

The API returns appropriate HTTP status codes:
- `201`: Relationship created successfully
- `400`: Validation error or business rule violation
- `404`: User profile or relationship not found
- `401`: Unauthorized access
- `500`: Internal server error

## Usage Examples

### Creating a Relationship
```javascript
const response = await fetch('/api/careeragent', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer your-jwt-token',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    careerAgentId: 'agent123',
    candidateId: 'candidate456',
    message: 'Initial career guidance setup'
  })
});
```

### Getting Agent's Candidates
```javascript
const response = await fetch('/api/careeragent/agent/agent123?status=active', {
  headers: {
    'Authorization': 'Bearer your-jwt-token'
  }
});
```

## Testing

Run the career agent tests:
```bash
npm test -- tests/careerAgent.test.js
```

## Integration

The Career Agent module integrates with:
- User Profile system for agent/candidate validation
- Authentication middleware for security
- MongoDB for data persistence

## Future Enhancements

1. **Notification System**: Alert candidates when assigned a new career agent
2. **Performance Metrics**: Track success rates and performance indicators
3. **Recommendation Engine**: Suggest optimal career agent matches
4. **Bulk Operations**: Assign multiple candidates to an agent at once
5. **Approval Workflow**: Require candidate approval for agent assignments
