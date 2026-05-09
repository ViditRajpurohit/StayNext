const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const passportLocalMongoose = require("passport-local-mongoose").default;

const userSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    resetOtp: String,
    resetOtpExpires: Date,
    // CHANGED: Structure to match Listing image object
    profilePhoto: {
        url: {
            type: String,
            default: "images/default-profile-photo1.png" 
        },
        filename: {
            type: String,
            default: "default_profile"
        }
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    verificationCode: String
});

userSchema.plugin(passportLocalMongoose, {
    usernameField: "email"
});

module.exports = mongoose.model("User", userSchema);