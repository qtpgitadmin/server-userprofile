import mongoose from 'mongoose';

const userProfileSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  firstName: {
    type: String,
    required: true,
    maxLength: 100
  },
  lastName: {
    type: String,
    required: true,
    maxLength: 100
  },
  headline: {
    type: String,
    maxLength: 200
  },
  summary: {
    type: String,
    maxLength: 2000
  },
  location: {
    country: { type: String, maxLength: 100 },
    city: { type: String, maxLength: 100 }
  },
  industry: {
    type: String,
    maxLength: 100
  },
  company: {
    type: String,
    maxLength: 100
  },
  profilePictureUrl: {
    type: String
  },
  backgroundPictureUrl: {
    type: String
  },
  contactInfo: {
    email: { 
      type: String,
      lowercase: true,
      trim: true
    },
    phone: { 
      type: String,
      maxLength: 20
    },
    websites: [{
      type: String
    }]
  },
  experience: [{
    title: { type: String, maxLength: 100 },
    company: { type: String, maxLength: 100 },
    location: { type: String, maxLength: 100 },
    startDate: { type: Date },
    endDate: { type: Date },
    current: { type: Boolean, default: false },
    description: { type: String, maxLength: 2000 }
  }],
  education: [{
    school: { type: String, maxLength: 100 },
    degree: { type: String, maxLength: 100 },
    fieldOfStudy: { type: String, maxLength: 100 },
    startDate: { type: Date },
    endDate: { type: Date },
    description: { type: String, maxLength: 1000 }
  }],
  skills: [{
    type: String,
    maxLength: 50
  }],
  languages: [{
    type: String,
    maxLength: 50
  }],
  certifications: [{
    name: { type: String, maxLength: 100 },
    organization: { type: String, maxLength: 100 },
    issueDate: { type: Date },
    expirationDate: { type: Date },
    credentialId: { type: String, maxLength: 100 }
  }],
  publications: [{
    title: { type: String, maxLength: 200 },
    publisher: { type: String, maxLength: 100 },
    publicationDate: { type: Date },
    url: { type: String }
  }],
  volunteerExperience: [{
    organization: { type: String, maxLength: 100 },
    role: { type: String, maxLength: 100 },
    startDate: { type: Date },
    endDate: { type: Date },
    description: { type: String, maxLength: 1000 }
  }],
  recommendations: [{
    recommender: { type: String, maxLength: 100 },
    relationship: { type: String, maxLength: 100 },
    text: { type: String, maxLength: 2000 },
    date: { type: Date }
  }],
  defaultResume: {
    type: String,
    description: 'Resume ID of the default resume for this user'
  }
}, {
  timestamps: true
});

// Pre-save middleware to generate id if not provided
userProfileSchema.pre('save', function(next) {
  if (!this.id) {
    this.id = this.userId || new mongoose.Types.ObjectId().toString();
  }
  next();
});

export default mongoose.model('UserProfile', userProfileSchema);