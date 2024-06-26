// backend/routes/user.js
const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const zod = require("zod");
const { User, University } = require("../db");
const jwt = require("jsonwebtoken");
const  { authMiddleware } = require("../middleware");
const dotenv = require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET

const signupBody = zod.object({
    username: zod.string(),
	firstName: zod.string(),
	lastName: zod.string(),
	password: zod.string(),
    studentId: zod.string(),
    registerCode: zod.string()
})

router.post("/signup", async (req, res) => {
    const { success } = signupBody.safeParse(req.body)
    if (!success) {
        return res.status(411).json({
            message: "Username already taken / Incorrect inputs"
        })
    }

    const existingUser = await User.findOne({
        username: req.body.username
    })

    if (existingUser) {
        return res.status(411).json({
            message: "Email already taken/Incorrect inputs"
        })
    }

    // verify registerCode
    const registerCode = req.body.registerCode
    const university = await University.findOne({registerCode})
    if (university) {
        const numberOfStudents = university.numberOfStudents;
        const students = university.students;
        if (students.length >= numberOfStudents) {
            return res.status(411).json({
                message: "University is full"
            })
        }
    } else {
        return res.status(411).json({
            message: "Invalid register code"
        })
    }

    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    const user = await User.create({
        username: req.body.username,
        password: hashedPassword,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        studentId: req.body.studentId,
        university: university.universityName
    })
    const userId = user._id;

    await University.updateOne({registerCode}, {
        $push: {
            students: userId
        }
    })

    const token = jwt.sign({
        userId: user._id,
        isProfessor: user.isProfessor,
        isAdmin: user.isAdmin
    }, JWT_SECRET);

    res.json({
        message: "User created successfully",
        token: token
    })
})


const signinBody = zod.object({
    username: zod.string(),
	password: zod.string()
})

router.post("/signin", async (req, res) => {
    const { success } = signinBody.safeParse(req.body)
    if (!success) {
        return res.status(411).json({
            message: "Username already taken / Incorrect inputs"
        })
    }

    const user = await User.findOne({
        username: req.body.username
    });

    if (user) {
        const isMatch = await bcrypt.compare(req.body.password, user.password);
        if (isMatch) {
            const token = jwt.sign({
                userId: user._id,
                isProfessor: user.isProfessor,
                isAdmin: user.isAdmin
            }, JWT_SECRET);
      
        return res.json({
            token: token
        });
        }
    }

    
    res.status(411).json({
        message: "Error while logging in"
    })
})

const updateBody = zod.object({
	password: zod.string().optional(),
    firstName: zod.string().optional(),
    lastName: zod.string().optional(),
})

router.put("/", authMiddleware, async (req, res) => {
    const { success } = updateBody.safeParse(req.body)
    if (!success) {
        res.status(411).json({
            message: "Error while updating information"
        })
    }

    await User.updateOne(req.body, {
        id: req.userId
    })

    res.json({
        message: "Updated successfully"
    })
})

router.get("/bulk", async (req, res) => {
    const filter = req.query.filter || "";

    const users = await User.find({
        $or: [{
            firstName: {
                "$regex": filter
            }
        }, {
            lastName: {
                "$regex": filter
            }
        }]
    })

    res.json({
        user: users.map(user => ({
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            _id: user._id
        }))
    })
})

module.exports = router;