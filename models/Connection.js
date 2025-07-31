import mongoose from 'mongoose';

const connectionSchema = new mongoose.Schema({
  careerAgentId: {
    type: String,
    required: function() {
      return this.connectionType === 'careerAgent';
    },
    ref: 'UserProfile'
  },
  candidateId: {
    type: String,
    required: function() {
      return this.connectionType === 'careerAgent';
    },
    ref: 'UserProfile'
  },
  requestorUserId: {
    type: String,
    required: function() {
      return this.connectionType === 'friend';
    },
    ref: 'UserProfile'
  },
  recipientUserId: {
    type: String,
    required: function() {
      return this.connectionType === 'friend';
    },
    ref: 'UserProfile'
  },
  connectionType: {
    type: String,
    enum: ['friend', 'careerAgent'],
    required: true
  },
  relationshipStatus: {
    type: String,
    enum: ['active', 'inactive', 'pending', 'proposed', 'requested', 'rejected'],
    default: 'active'
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date,
    default: null
  },
  message: {
    type: String,
    maxlength: 1000
  }
}, {
  timestamps: true
});

// Index for efficient queries
connectionSchema.index({ careerAgentId: 1 });
connectionSchema.index({ candidateId: 1 });
connectionSchema.index({ requestorUserId: 1 });
connectionSchema.index({ recipientUserId: 1 });
connectionSchema.index({ connectionType: 1 });
connectionSchema.index({ careerAgentId: 1, relationshipStatus: 1 });
connectionSchema.index({ requestorUserId: 1, recipientUserId: 1 });
connectionSchema.index({ connectionType: 1, relationshipStatus: 1 });

// Compound unique index to ensure only one active relationship per candidate for careerAgent type
connectionSchema.index(
  { candidateId: 1, relationshipStatus: 1, connectionType: 1 }, 
  { 
    unique: true, 
    partialFilterExpression: { 
      relationshipStatus: 'active',
      connectionType: 'careerAgent'
    }
  }
);

// Compound unique index to prevent duplicate friend connections
connectionSchema.index(
  { requestorUserId: 1, recipientUserId: 1, connectionType: 1 }, 
  { 
    unique: true, 
    partialFilterExpression: { 
      connectionType: 'friend'
    }
  }
);

// Virtual to populate career agent details
connectionSchema.virtual('careerAgent', {
  ref: 'UserProfile',
  localField: 'careerAgentId',
  foreignField: 'userId',
  justOne: true
});

// Virtual to populate candidate details
connectionSchema.virtual('candidate', {
  ref: 'UserProfile',
  localField: 'candidateId',
  foreignField: 'userId',
  justOne: true
});

// Virtual to populate requestor details
connectionSchema.virtual('requestor', {
  ref: 'UserProfile',
  localField: 'requestorUserId',
  foreignField: 'userId',
  justOne: true
});

// Virtual to populate recipient details
connectionSchema.virtual('recipient', {
  ref: 'UserProfile',
  localField: 'recipientUserId',
  foreignField: 'userId',
  justOne: true
});

// Ensure virtuals are included in JSON output
connectionSchema.set('toJSON', { 
  virtuals: true,
  transform: function(doc, ret) {
    ret.connectionId = ret._id;
    delete ret._id;
    delete ret.__v;
    delete ret.id; // Remove the virtual id field to avoid conflicts
    return ret;
  }
});
connectionSchema.set('toObject', { virtuals: true });

// Disable the virtual id field that Mongoose creates by default
connectionSchema.set('id', false);

export default mongoose.model('Connection', connectionSchema);
