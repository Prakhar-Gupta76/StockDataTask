const express = require('express')
const router = require('./router.js')
const connectDB = require('./db.js')
const dotenv = require('dotenv')
const app = express()
const PORT = 8001
dotenv.config()

app.use(express.json())

app.use('/api/', router);

app.listen(PORT, () => {
    console.log('Server is running on', PORT);
})

connectDB()