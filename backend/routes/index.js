// backend/user/index.js
const express = require('express');
const userRouter = require("./user");
const professorRouter = require("./professor");
const adminRouter = require('./admin');
const labRouter = require('./lab');

const router = express.Router();

router.use("/user", userRouter);
router.use("/professor", professorRouter);
router.use("/admin", adminRouter);
router.use("/lab", labRouter);


module.exports = router;