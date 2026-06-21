const mongoose =
  require('mongoose');

const inquirySchema =
  new mongoose.Schema(
    {
      name: {
        type: String,
        required: true,
        trim: true
      },

      email: {
        type: String,
        trim: true,
        lowercase: true
      },

      phone: {
        type: String,
        required: true,
        trim: true
      },

      message: {
        type: String,
        required: true,
        trim: true
      },

      product: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref: 'Product'
      },

      status: {
        type: String,

        enum: [
          'pending',
          'contacted',
          'resolved'
        ],

        default: 'pending'
      }
    },

    {
      timestamps: true
    }
  );

module.exports =
  mongoose.model(
    'Inquiry',
    inquirySchema
  );