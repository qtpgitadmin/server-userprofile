import mongoose from 'mongoose';

const ParticipantSchema = new mongoose.Schema({
  id: { type: String, required: true },
  userId: { type: String, required: true },
  firstName: String,
  lastName: String,
  joined_at: { type: Date, required: true },
  left_at: { type: Date, default: null },
  history_window: { type: String, enum: ['ALL', 'NONE'], match: /^(ALL|NONE|DAYS_[0-9]+)$/ }
}, { _id: false });

const MessageSchema = new mongoose.Schema({
  id: { type: String, required: true },
  sender_id: { type: String, required: true },
  content: { type: String, required: true },
  created_at: { type: Date, required: true },
  visible_to: [String]
}, { _id: false });

const ConversationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: String,
  created_at: { type: Date, required: true },
  history_window: { type: String, match: /^(ALL|NONE|DAYS_[0-9]+)$/ },
  participants: [ParticipantSchema],
  messages: [MessageSchema],
  context: {
    jobId: String,
    postId: String,
    resumeId: String
  }
});

export default mongoose.model('Conversation', ConversationSchema);