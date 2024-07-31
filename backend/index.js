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

app.use(cors({
  origin: ['https://virtualnurselab.com', 'https://www.virtualnurselab.com']
}));
app.use(express.json());

app.use("/api/v1", rootRouter);

app.listen(3000);