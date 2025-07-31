import mongoose from 'mongoose';

const careerAgentSchema = new mongoose.Schema({
  careerAgentId: {
    type: String,
    required: true,
    ref: 'UserProfile'
  },
  candidateId: {
    type: String,
    required: true,
    ref: 'UserProfile'
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
careerAgentSchema.index({ careerAgentId: 1 });
careerAgentSchema.index({ candidateId: 1 });
careerAgentSchema.index({ careerAgentId: 1, relationshipStatus: 1 });

// Compound unique index to ensure only one active relationship per candidate
careerAgentSchema.index(
  { candidateId: 1, relationshipStatus: 1 }, 
  { 
    unique: true, 
    partialFilterExpression: { relationshipStatus: 'active' }
  }
);

// Virtual to populate career agent details
careerAgentSchema.virtual('careerAgent', {
  ref: 'UserProfile',
  localField: 'careerAgentId',
  foreignField: 'userId',
  justOne: true
});

// Virtual to populate candidate details
careerAgentSchema.virtual('candidate', {
  ref: 'UserProfile',
  localField: 'candidateId',
  foreignField: 'userId',
  justOne: true
});

// Ensure virtuals are included in JSON output
careerAgentSchema.set('toJSON', { 
  virtuals: true,
  transform: function(doc, ret) {
    ret.relationshipId = ret._id;
    delete ret._id;
    delete ret.__v;
    delete ret.id; // Remove the virtual id field to avoid conflicts
    return ret;
  }
});
careerAgentSchema.set('toObject', { virtuals: true });

// Disable the virtual id field that Mongoose creates by default
careerAgentSchema.set('id', false);

export default mongoose.model('CareerAgent', careerAgentSchema);
