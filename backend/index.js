// backend/index.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require("cors");
const rootRouter = require("./routes/index");

const dotenv = require('dotenv').config();

const app = express();

//------------ DB Configuration ------------//
const db = process.env.MONGO_URI;

//------------ Mongo Connection ------------//
mongoose.connect(db, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
    .then(() => console.log('Successfully connected to MongoDB'))
    .catch(err => console.log(err));

// Get allowed origins from environment variable
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json());

app.use("/api/v1", rootRouter);

app.listen(3000);