const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Database connected")
    }
    catch (err) {
        return res.status(500).json(err);
    }

}


module.exports = connectDB;