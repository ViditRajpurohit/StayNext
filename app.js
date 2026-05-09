if (process.env.NODE_ENV !== "production") {
    require("dotenv").config();
}

const express = require("express");
const mongoose = require("mongoose");
const Listing = require("./models/listing.js");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const Review = require("./models/review.js");
const session = require("express-session"); 
const MongoStore = require('connect-mongo')(session);
const flash = require("connect-flash");
const User = require("./models/user.js");
const passport = require("passport");
const LocalStrategy = require("passport-local"); 
const nodemailer = require("nodemailer");
const multer = require("multer");
const { isLoggedIn } = require("./middleware.js");
const { storage } = require("./cloudConfig.js");
const upload = multer({ storage });
const app = express();



const dbURL = process.env.ATLAS_DB_URL;




main();

async function main() {
    try {
        await mongoose.connect(dbURL);
        console.log("Connected to MongoDB Atlas!");
        
        // Only start the server AFTER the database is connected
        app.listen(8080, () => {
            console.log("Server is listening on port 8080");
        });
    } catch (err) {
        console.log("Database connection failed:", err.message);
    }
}

app.engine('ejs', ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));


const store = new MongoStore({
  url: dbURL,
  secret: "mysupersecretcode",
  touchAfter: 24 * 3600,
});

store.on("error", (err) => {
    console.log("ERROR in MONGO SESSION STORE", err);
});

// Session Configuration
const sessionOptions = {
    store,
    secret: "mysupersecretcode",
    resave: false,
    saveUninitialized: true,
    cookie: {
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
    },
};



app.use(session(sessionOptions));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy({ usernameField: 'email' }, User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());


app.use((req, res, next) => {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    res.locals.currUser = req.user;
    res.locals.currPath = req.path;
    next();
});











// --- ROUTES ---

app.get("/signup", (req, res) => {
    res.render("users/signup.ejs");
})





const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS ,
    }
});

// Signup Route
app.post("/signup", async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        
        // 1. Register User in DB
        const newUser = new User({ name, email, verificationCode: code });
        await User.register(newUser, password);

        // 2. Define Email Options
        const mailOptions = {
            from: `"StayNest Support" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Verify your StayNest Account',
            html: `
                <div style="font-family: sans-serif; text-align: center; color: #333;">
                    <h2>Welcome to StayNest, ${name}!</h2>
                    <p>Your verification code is:</p>
                    <h1 style="color: #ff385c; letter-spacing: 5px;">${code}</h1>
                    <p>This code will expire in 10 minutes.</p>
                </div>
            `
        };

        // 3. Send the Mail
        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${email}`);

        req.flash("success", "Verification code sent to your email!");
        res.redirect(`/verify?email=${encodeURIComponent(email)}`);

    } catch (e) {
        req.flash("error", e.message);
        res.redirect("/signup");
    }
});

//resend email route
app.get("/resend-code", async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) {
            req.flash("error", "Email is required to resend code.");
            return res.redirect("/signup");
        }

        const user = await User.findOne({ email: email });
        if (!user) {
            req.flash("error", "User not found.");
            return res.redirect("/signup");
        }

        // 1. Generate a new 6-digit code
        const newCode = Math.floor(100000 + Math.random() * 900000).toString();
        
        // 2. Update user in Database
        user.verificationCode = newCode;
        await user.save();

        // 3. Resend the Email
        const mailOptions = {
            from: `"StayNest Support" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'New Verification Code - StayNest',
            html: `
                <div style="font-family: sans-serif; text-align: center;">
                    <h2>Your New Verification Code</h2>
                    <h1 style="color: #ff385c; letter-spacing: 5px;">${newCode}</h1>
                    <p>Use this code to verify your account.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);

        // 4. Redirect back to verify page with a success message
        req.flash("success", "A new code has been sent to your email!");
        res.redirect(`/verify?email=${encodeURIComponent(email)}`);

    } catch (e) {
        req.flash("error", "Failed to resend code: " + e.message);
        res.redirect("/signup");
    }
});

//verify route
// Verification Logic (When user submits the 6-digit code)


app.get("/verify", (req, res) => {
    // Pick the email up from the URL query string
    const { email } = req.query; 
    res.render("users/verify.ejs", { email });
});


app.post("/verify", async (req, res) => {
    try {
        const { email, verificationCode } = req.body;
        const user = await User.findOne({ email: email });

        if (!user) {
            req.flash("error", "User not found.");
            return res.redirect("/signup");
        }

        if (user.verificationCode === verificationCode) {
            user.isVerified = true;
            // Optional: Clear the code after verification
            user.verificationCode = undefined; 
            await user.save();

            req.flash("success", "Email verified successfully! Login to continue.");
            res.redirect("/login");
        } else {
            req.flash("error", "Invalid verification code. Please try again.");
            res.render("users/verify", { email });
        }
    } catch (e) {
        req.flash("error", e.message);
        res.redirect("/signup");
    }
});



//login route
app.get("/login", (req, res) => {
    res.render("users/login.ejs");
});

app.post("/login", 
    passport.authenticate("local", { 
        failureFlash: true, 
        failureRedirect: "/login" 
    }), 
    (req, res) => {
        // This function only runs if authentication is successful
        req.flash("success", "Welcome back to StayNest!");
        res.redirect("/listings"); // Redirect to the main listings page
    }
);

//forgot password route
app.get("/forgot-password", (req, res) => {
    res.render("users/forgot.ejs");
});


app.post("/send-otp", async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email: email });

    if (!user) {
        req.flash("error", "No account with that email address exists.");
        return res.redirect("/forgot-password");
    }

    // Generate a random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Save OTP and expiry (e.g., 10 minutes) to the database
    user.resetOtp = otp;
    user.resetOtpExpires = Date.now() + 600000; 
    await user.save();

    // Configure Nodemailer
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER, // Your Gmail
            pass: process.env.EMAIL_PASS  // Your App Password
        }
    });

    const mailOptions = {
        from: `"StayNest Support" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'StayNest Password Reset OTP',
        html: `
            <div style="font-family: sans-serif; text-align: center;">
                <h2>Your One Time Password</h2>
                
                <h1 style="color: #ff385c; letter-spacing: 5px;">${otp}</h1>
                <p>Use this code to change password of your account.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        req.flash("success", "OTP sent to your email!");
        res.render("users/verify-otp.ejs", { email }); // Move to verification page
    } catch (err) {
        console.error("Mail Error:", err);
        req.flash("error", "Failed to send OTP. Please try again.");
        res.redirect("/forgot-password");
    }
});



app.post("/verify-otp", async (req, res) => {
    const { email, otp } = req.body;
    const user = await User.findOne({ 
        email: email, 
        resetOtp: otp, 
        resetOtpExpires: { $gt: Date.now() } // Check if not expired
    });

    if (!user) {
        req.flash("error", "Invalid or expired OTP.");
        return res.redirect("/forgot-password");
    }

    // If valid, render the password reset page
    res.render("users/reset-password.ejs", { email, otp });
});

//reset password route

app.post("/reset-password", async (req, res) => {
    try {
        const { email, otp, password } = req.body;

        // 1. Double check the user and OTP one last time for security
        const user = await User.findOne({ 
            email: email, 
            resetOtp: otp, 
            resetOtpExpires: { $gt: Date.now() } 
        });

        if (!user) {
            req.flash("error", "Session expired or invalid. Please try again.");
            return res.redirect("/forgot-password");
        }

        // 2. Use Passport-Local-Mongoose method to update and hash the password
        await user.setPassword(password);

        // 3. Clear OTP fields so they can't be used again
        user.resetOtp = undefined;
        user.resetOtpExpires = undefined;
        
        await user.save();

        req.flash("success", "Password updated successfully! You can now login.");
        res.redirect("/login");

    } catch (e) {
        console.error("Reset Error:", e);
        req.flash("error", "Something went wrong. Please try again.");
        res.redirect("/forgot-password");
    }
});

// Logout Route
app.get("/logout", (req, res, next) => {
    req.logout((err) => {
        if (err) {
            return next(err);
        }
        req.flash("success", "Logged you out!");
        res.redirect("/listings");
    });
});




// Index route
app.get("/listings", async (req, res) => {
    const allListings = await Listing.find({});
    res.render("listings/index.ejs", { allListings });

});


//user profile route

app.get("/profile", isLoggedIn, async (req, res) => {
    res.render("users/profile.ejs");
});


//profile update route
app.put("/profile/update-photo", isLoggedIn, upload.single("profilePhoto"), async (req, res) => {
    try {
        if (!req.file) {
            req.flash("error", "No image selected!");
            return res.redirect("/profile");
        }

        // Find the user fresh from the DB
        const user = await User.findById(req.user._id);

        // SAFELY check for old photo and delete from Cloudinary
        // Only delete if filename exists and it's not a default placeholder
        if (user.profilePhoto && user.profilePhoto.filename && !user.profilePhoto.url.includes("default")) {
            try {
                await cloudinary.uploader.destroy(user.profilePhoto.filename);
            } catch (cloudErr) {
                console.log("Cloudinary Delete Error (Skipped):", cloudErr);
                // We don't crash the whole app if old photo deletion fails
            }
        }

        // Update with new data
        user.profilePhoto = {
            url: req.file.path,
            filename: req.file.filename
        };

        await user.save();
        
        req.flash("success", "Profile photo updated!");
        res.redirect("/profile");
    } catch (e) {
        console.error("Full Error Details:", e); // Check your VS Code terminal for the specific error
        req.flash("error", "Failed to update photo.");
        res.redirect("/profile");
    }
});

// New-list route (Keep this ABOVE the /listings/:id route)
app.get("/listings/new-list", (req, res) => {
    res.render("listings/new.ejs");
});


// Create route - Ensure the owner is saved
app.post("/listings",upload.single("listing[image]"), async (req, res) => {
    try {

        let url = req.file.path;
        let filename = req.file.filename;
        

        const newListing = new Listing(req.body.listing);
        
        // Debugging: Log this to your terminal to see if the user is actually found
        console.log("Current User during creation:", req.user);

        if (!req.user) {
            req.flash("error", "You must be logged in to create a listing!");
            return res.redirect("/login");
        }

        newListing.image = { url, filename };

        newListing.owner = req.user._id; // Link the logged-in user's ID
        await newListing.save();
        
        req.flash("success", "Successfully made a new listing!");
        res.redirect("/listings");
    } catch (e) {
        req.flash("error", e.message);
        res.redirect("/listings/new-list");
    }
});

// Show route
// Show route - COMBINED VERSION
app.get("/listings/:id", async (req, res) => {
    try {
        let { id } = req.params;
        const listing = await Listing.findById(id)
            .populate("reviews")
            .populate("owner")
            .populate({
                path: "reviews",
                populate: {
                    path: "author", // This populates the author inside each review
                },
            });
        
        if (!listing) {
            req.flash("error", "Listing you requested for does not exist!");
            return res.redirect("/listings");
        }
        res.render("listings/show.ejs", { listing });
    } catch (err) {
        res.status(404).render("404.ejs");
    }
});







// Edit route
app.get("/listings/:id/edit", async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id);
    res.render("listings/edit.ejs", { listing });
});

// Update route
// PUT Route
app.put("/listings/:id", upload.single("listing[image]"), async (req, res) => {
    let { id } = req.params;
    let listing = await Listing.findByIdAndUpdate(id, { ...req.body.listing });

    // Check if a new file was uploaded
    if (typeof req.file !== "undefined") {
        let url = req.file.path;
        let filename = req.file.filename;
        listing.image = { url, filename };
        await listing.save();
    }

    req.flash("success", "Listing Updated!");
    res.redirect(`/listings/${id}`);
});

// Delete route
app.delete("/listings/:id", async (req, res) => {
    let { id } = req.params;
    await Listing.findByIdAndDelete(id);
    req.flash("success", "Listing deleted successfully!");
    res.redirect("/listings");
});

// Home route
app.get("/", (req, res) => {
    res.send("Hello ji");
});


//Reviews post route

app.post("/listings/:id/reviews", async (req, res) => {

    if (!req.user) {
        req.flash("error", "You must be logged in to create a review!");
        return res.redirect(`/listings/${req.params.id}`);
    }   
    let listing = await Listing.findById(req.params.id);
    let newReview = await new Review(req.body.review);

    newReview.author = req.user._id;

    listing.reviews.push(newReview);

    await newReview.save();
    await listing.save();
    console.log(listing);
    console.log(newReview);
    req.flash("success", "New Review Created!");
    res.redirect(`/listings/${listing._id}`)
    
    
})

//Delete review route
app.delete("/listings/:id/reviews/:reviewId", async (req, res) => {
    let { id, reviewId } = req.params;
    await Listing.findByIdAndUpdate(id, { $pull: { reviews: reviewId } });
    await Review.findByIdAndDelete(reviewId);
    req.flash("success", "Review deleted successfully!");
    res.redirect(`/listings/${id}`);
})

// app.all("*", (req, res) => {
//     res.status(404).render("404.ejs");
// });

// --- SERVER ---
// app.listen(8080, () => {
//     console.log("Server started!");
// });
