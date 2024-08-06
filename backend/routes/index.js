// backend/user/index.js
const express = require('express');
const userRouter = require("./user");
const studentRouter = require("./student");
const professorRouter = require("./professor");
const adminRouter = require('./admin');
const labRouter = require('./lab');
const testRouter = require('./test');
const labDeployedRouter = require('./lab-deployed');
const testChunkRouter = require('./test-chunk');

const router = express.Router();

router.use("/user", userRouter);
router.use("/student", studentRouter);
router.use("/professor", professorRouter);
router.use("/admin", adminRouter);
router.use("/lab", labRouter);
router.use("/lab-deployed", labDeployedRouter);
router.use("/test", testRouter);
router.use("/test-chunk", testChunkRouter);


module.exports = router;