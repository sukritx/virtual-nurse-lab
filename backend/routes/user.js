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
    username: zod.string().min(1).regex(/^[a-z0-9]+$/, { message: "Username must contain only lowercase letters and numbers" }),
    firstName: zod.string().min(1).regex(/^[a-zA-Z]+$/, { message: "First name must contain only letters" }),
    lastName: zod.string().min(1).regex(/^[a-zA-Z]+$/, { message: "Last name must contain only letters" }),
    password: zod.string().min(6, { message: "Password must be at least 6 characters long" }),
    studentId: zod.string().regex(/^[0-9]+$/, { message: "Student ID must contain only numbers" }),
    registerCode: zod.string().min(1)
})

router.post("/signup", async (req, res) => {
    const result = signupBody.safeParse(req.body)
    if (!result.success) {
        return res.status(400).json({
            message: "Invalid input",
            errors: result.error.errors.map(err => err.message)
        })
    }

    const existingUser = await User.findOne({
        username: req.body.username
    })

    if (existingUser) {
        return res.status(409).json({
            message: "Username already taken"
        })
    }

    // verify registerCode
    const registerCode = req.body.registerCode
    const university = await University.findOne({registerCode})
    if (!university) {
        return res.status(400).json({
            message: "Invalid register code"
        })
    }

    const numberOfStudents = university.numberOfStudents;
    const students = university.students;
    if (students.length >= numberOfStudents) {
        return res.status(400).json({
            message: "University is full"
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
        token: token,
        user: {
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            studentId: user.studentId,
            university: user.university
        }
    })
})


const signinBody = zod.object({
    username: zod.string(),
    password: zod.string()
});

router.post("/signin", async (req, res) => {
    try {
        const { success } = signinBody.safeParse(req.body);
        if (!success) {
            console.error("Input validation failed");
            return res.status(400).json({
                message: "Incorrect inputs"
            });
        }

        const user = await User.findOne({
            username: req.body.username
        });

        if (!user) {
            console.error("User not found");
            return res.status(404).json({
                message: "User not found"
            });
        }

        const isMatch = await bcrypt.compare(req.body.password, user.password);
        if (!isMatch) {
            console.error("Invalid password");
            return res.status(401).json({
                message: "Invalid password"
            });
        }

        const token = jwt.sign({
            userId: user._id,
            isProfessor: user.isProfessor,
            isAdmin: user.isAdmin
        }, JWT_SECRET);

        const userObject = user.toObject(); // Convert Mongoose document to plain JavaScript object
        delete userObject.password; // Remove password field
        delete userObject.isAdmin;
        delete userObject.isProfessor;

        return res.json({
            token: token,
            user: userObject
        });
    } catch (error) {
        console.error("Error during signin:", error);
        return res.status(500).json({
            message: "Internal server error"
        });
    }
});

module.exports = router;