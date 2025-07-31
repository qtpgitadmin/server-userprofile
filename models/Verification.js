import mongoose from 'mongoose';

const verificationSchema = new mongoose.Schema({
  verificationId: {
    type: String,
    required: true,
    unique: true,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    trim: true
  },
  recipientEmail: {
    type: String,
    required: [true, 'Recipient email is required'],
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid recipient email address']
  },
  verificationCode: {
    type: String,
    required: true,
    length: 6
  },
  status: {
    type: String,
    default: 'pending',
    enum: {
      values: ['pending', 'verified', 'expired'],
      message: 'Status must be one of: pending, verified, expired'
    }
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
    expires: 0 // MongoDB TTL index
  },
  verifiedAt: {
    type: Date
  },
  attempts: {
    type: Number,
    default: 0,
    max: 3
  },
  metadata: {
    ipAddress: String,
    userAgent: String,
    requestTime: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true
});

// Indexes for better query performance
verificationSchema.index({ verificationId: 1 }, { unique: true });
verificationSchema.index({ requesterEmail: 1 });
verificationSchema.index({ recipientEmail: 1 });
verificationSchema.index({ status: 1 });
verificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for checking if verification is expired
verificationSchema.virtual('isExpired').get(function() {
  return this.expiresAt < new Date();
});

// Instance method to validate code
verificationSchema.methods.validateCode = function(code) {
  return this.verificationCode === code.trim();
};

// Instance method to check if can be verified
verificationSchema.methods.canBeVerified = function() {
  return this.status === 'pending' && 
         this.attempts < 3 && 
         this.expiresAt > new Date();
};

// Pre-save middleware to auto-expire
verificationSchema.pre('save', function(next) {
  if (this.expiresAt < new Date() && this.status === 'pending') {
    this.status = 'expired';
  }
  next();
});

export default mongoose.model('Verification', verificationSchema);