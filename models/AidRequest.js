const crypto = require('crypto');
const mongoose = require('mongoose');

const STATUSES = ['pending', 'in-progress', 'fulfilled'];
const URGENCY_LABELS = { 1: 'Low', 2: 'Medium', 3: 'High' };

// One entry in a request's audit trail
const historySchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    action: { type: String, enum: ['created', 'status', 'assigned', 'note', 'updated'], required: true },
    detail: { type: String, maxlength: 300 },
  },
  { _id: false }
);

// A request for help, logged by an admin on behalf of a community member
const aidRequestSchema = new mongoose.Schema(
  {
    ref: { type: String, unique: true, sparse: true }, // short reference, e.g. CA-3F9A1C
    fullName: { type: String, required: [true, 'Full name is required'], trim: true, maxlength: 100 },
    phone: {
      type: String, trim: true, maxlength: 30,
      match: [/^[0-9+()\-.\s]{3,30}$/, 'Phone number can only contain digits, spaces and + ( ) - .'],
    },
    email: {
      type: String, trim: true, lowercase: true, maxlength: 120,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address'],
    },
    aidType: {
      type: String,
      required: [true, 'Choose the type of help needed'],
      enum: { values: ['food', 'financial'], message: 'Aid type must be food or financial' },
    },
    householdSize: {
      type: Number, default: 1,
      min: [1, 'Household size must be at least 1'], max: [30, 'Household size cannot exceed 30'],
    },
    amountNeeded: {
      type: Number, min: [0, 'Amount cannot be negative'], max: [1000000, 'Amount is too large'],
    }, // financial requests only
    description: { type: String, required: [true, 'Please describe the need'], trim: true, maxlength: 1000 },
    urgency: { type: Number, enum: { values: [1, 2, 3], message: 'Choose an urgency level' }, default: 2 },
    status: { type: String, enum: STATUSES, default: 'pending' },
    assignedResource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource' },
    notes: { type: String, trim: true, maxlength: 1000 }, // volunteer / staff notes
    fulfilledAt: Date,
    history: [historySchema],
  },
  { timestamps: true }
);

aidRequestSchema.index({ status: 1, urgency: -1, createdAt: 1 });
aidRequestSchema.index({ aidType: 1, status: 1 });
aidRequestSchema.index({ assignedResource: 1 });
aidRequestSchema.index({ createdAt: -1 });

aidRequestSchema.pre('validate', function () {
  // Require at least one way to contact the requester
  if (!this.phone && !this.email) {
    this.invalidate('phone', 'Provide a phone number or an email address');
  }
  // Give new requests a short reference people can quote on the phone
  if (!this.ref) {
    this.ref = 'CA-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  }
  // Amount only applies to financial requests
  if (this.aidType !== 'financial') this.amountNeeded = undefined;
});

aidRequestSchema.pre('save', function () {
  if (this.isNew && !this.history.some((h) => h.action === 'created')) {
    this.history.unshift({ action: 'created', detail: `Request logged for ${this.aidType} aid` });
  }
  if (this.isModified('status')) {
    this.fulfilledAt = this.status === 'fulfilled' ? this.fulfilledAt || new Date() : undefined;
  }
});

aidRequestSchema.virtual('urgencyLabel').get(function () {
  return URGENCY_LABELS[this.urgency];
});

// Fallback for records created before reference numbers existed
aidRequestSchema.virtual('refCode').get(function () {
  return this.ref || 'CA-' + String(this._id).slice(-6).toUpperCase();
});

aidRequestSchema.virtual('daysOpen').get(function () {
  const end = this.fulfilledAt || new Date();
  return Math.max(0, Math.floor((end - this.createdAt) / 86400000));
});

aidRequestSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('AidRequest', aidRequestSchema);
