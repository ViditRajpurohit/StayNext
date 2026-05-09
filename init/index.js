require('dotenv').config();

const mongoose = require("mongoose");
const initData = require("./data.js");
const Listing = require("../models/listing.js");


const dbURL = process.env.ATLAS_DB_URL;


main().then(() => {
    console.log("MongoDB Connected :)");
    
}).catch(() => {
    console.log("MongoDB not Connected :(")
})

async function main() {
    await mongoose.connect(dbURL);
    
    
};

const initDB = async () => {
    try {
        await Listing.deleteMany({});
        const dataWithOwners = initData.data.map((obj) => ({
            ...obj,
            owner: "69fed30deed872520d9d3580",
            image: {
                url: obj.image,
                filename: "listingimage",
            }
        }));
        await Listing.insertMany(dataWithOwners);
        console.log("Data was initialized!");
    } catch (err) {
        console.log("Error during data insertion:", err);
    }
};

initDB();
