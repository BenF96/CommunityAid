const mongoose = require('mongoose');

// A community resource: food bank, pantry, meal program, financial aid program, etc.
const resourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 120 },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: { values: ['food', 'financial'], message: 'Category must be food or financial' },
    },
    type: { type: String, trim: true, maxlength: 60 }, // e.g. Food Bank, Rent Assistance
    description: { type: String, trim: true, maxlength: 1000 },
    address: { type: String, trim: true, maxlength: 200 },
    serviceArea: { type: String, trim: true, maxlength: 120 }, // e.g. "Eastside & Downtown"
    phone: {
      type: String, trim: true, maxlength: 30,
      match: [/^[0-9+()\-.\s]{3,30}$/, 'Phone number can only contain digits, spaces and + ( ) - .'],
    },
    email: {
      type: String, trim: true, lowercase: true, maxlength: 120,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address'],
    },
    website: {
      type: String, trim: true, maxlength: 200,
      match: [/^https?:\/\/\S+$/i, 'Website must start with http:// or https://'],
    },
    hours: { type: String, trim: true, maxlength: 120 },
    eligibility: { type: String, trim: true, maxlength: 500 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

resourceSchema.index({ category: 1, isActive: -1, name: 1 });

module.exports = mongoose.model('Resource', resourceSchema);
