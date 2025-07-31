import mongoose from 'mongoose';

const resumeSchema = new mongoose.Schema({
  resumeId: {
    type: String,
    required: true,
    unique: true,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  // Add forUserId and byUserId fields
  forUserId: {
    type: String,
    trim: true,
    description: 'The userId for whom the resume is uploaded'
  },
  byUserId: {
    type: String,
    trim: true,
    description: 'The userId who uploaded the resume'
  },
  name: {
    type: String,
    required: true,
    maxLength: 200,
    trim: true
  },
  filePath: {
    type: String,
    required: true
  },
  originalFileName: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    required: true,
    enum: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  },
  // Remove createdBy
  isActive: {
    type: Boolean,
    default: true
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  lastDownloadedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for better query performance
resumeSchema.index({ resumeId: 1 }, { unique: true });
resumeSchema.index({ userId: 1 });
resumeSchema.index({ forUserId: 1 });
resumeSchema.index({ byUserId: 1 });
resumeSchema.index({ createdBy: 1 });
resumeSchema.index({ isActive: 1 });
resumeSchema.index({ createdAt: -1 });

// Virtual for file extension
resumeSchema.virtual('fileExtension').get(function() {
  return this.originalFileName.split('.').pop().toLowerCase();
});

// Instance method to check if file is PDF
resumeSchema.methods.isPDF = function() {
  return this.mimeType === 'application/pdf';
};

// Instance method to check if file is Word document
resumeSchema.methods.isWordDocument = function() {
  return this.mimeType === 'application/msword' || 
         this.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
};

// Instance method to get file size in human readable format
resumeSchema.methods.getFormattedFileSize = function() {
  const bytes = this.fileSize;
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Pre-save middleware to generate resumeId if not provided
resumeSchema.pre('save', function(next) {
  if (!this.resumeId) {
    this.resumeId = new mongoose.Types.ObjectId().toString();
  }
  next();
});

export default mongoose.model('Resume', resumeSchema);