const mongoose =
  require('mongoose');

const authSchema =
  new mongoose.Schema(
    {
      name: {
        type: String,

        required: true,

        trim: true,

        minlength: 2,

        maxlength: 60
      },

      email: {
        type: String,

        required: true,

        unique: true,

        lowercase: true,

        trim: true,

        index: true
      },

      password: {
        type: String,

        required: true,

        minlength: 6,

        select: false
      },

      role: {
        type: String,

        enum: [
          'admin',
          'customer'
        ],

        default:
          'customer'
      },

      isActive: {
        type: Boolean,

        default: true
      },

      lastLogin: {
        type: Date
      }
    },

    {
      timestamps: true,

      versionKey: false
    }
  );

/* ======================
   SAFE JSON RESPONSE
====================== */

authSchema.methods.toJSON =
  function () {

    const user =
      this.toObject();

    delete user.password;

    return user;
  };

/* ======================
   INDEXES
====================== */

authSchema.index({
  email: 1
});

module.exports =
  mongoose.model(
    'User',
    authSchema
  );