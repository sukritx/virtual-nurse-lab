// backend/user/index.js
const express = require('express');
const userRouter = require("./user");
const accountRouter = require("./account");
const adminRouter = require('./admin');
const labRouter = require('./lab');

const router = express.Router();

router.use("/user", userRouter);
router.use("/account", accountRouter);
router.use("/admin", adminRouter);
router.use("/lab", labRouter);


module.exports = router;