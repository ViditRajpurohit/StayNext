const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const Review = require("./review.js"); // Ensure you have this for deleting reviews
const { cloudinary } = require("../cloudConfig.js"); // Import cloudinary to use its delete method

let listingSchema = new Schema({
    title: {
        type: String,
        required: true,
    },
    description: String,
    image: {
        url: String,
        filename: String,
    },
    price: {
        type: Number,
        required: true,
    },
    location: {
        type: String,
        required: true,
    },
    country: {
        type: String,
        required: true,
    },
    reviews: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Review",
        },
    ],
    owner: {
        type: Schema.Types.ObjectId,
        ref: "User",
    },
});

// Middleware: Triggered AFTER a listing is deleted
listingSchema.post("findOneAndDelete", async (listing) => {
    if (listing) {
        // 1. Delete the image from Cloudinary
        if (listing.image && listing.image.filename) {
            await cloudinary.uploader.destroy(listing.image.filename);
            console.log("Deleted image from Cloudinary");
        }

        // 2. Cleanup: Delete all associated reviews from the database
        if (listing.reviews.length) {
            await Review.deleteMany({ _id: { $in: listing.reviews } });
            console.log("Deleted associated reviews");
        }
    }
});

const Listing = mongoose.model("Listing", listingSchema);
module.exports = Listing;