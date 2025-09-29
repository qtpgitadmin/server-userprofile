import mongoose from 'mongoose';

const userCoverLetterSchema = new mongoose.Schema(
  {
    // System-generated unique identifier (MongoDB ObjectId will be used automatically)
    fromUserId: {
      type: String,
      required: true,
      trim: true
    },
    forUserId: {
      type: String,
      required: true,
      trim: true
    },
    title: {
      type: String,
      required: true,
      maxlength: 255,
      trim: true
    },
    text: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now
    }
  },
  {
    versionKey: false // disables __v
  }
);

export default mongoose.model('UserCoverLetter', userCoverLetterSchema);
