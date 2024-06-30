// backend/db.js
const mongoose = require('mongoose');

// Create a Schema for Users
const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        minLength: 3,
        maxLength: 30
    },
    password: {
        type: String,
        required: true,
        minLength: 6
    },
    firstName: {
        type: String,
        required: true,
        trim: true,
    },
    lastName: {
        type: String,
        required: true,
        trim: true,
    },
    studentId: {
        type: String,
        required: false,
    },
    university: {
        type: String,
        required: false,
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    isProfessor: {
        type: Boolean,
        default: false
    },
});

const universitySchema = new mongoose.Schema({
    universityName: {
        type: String,
        required: true,
    },
    numberOfStudents: {
        type: Number,
        required: true,
    },
    registerCode: {
        type: String,
        required: true
    },
    students: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    professor: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
})

const labSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    universityId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'University',
        required: true
    },
    lab: [{
        question: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'LabQuestion',
            required: true
        },
        videoPath: {
            type: String,
            required: true
        },
        studentAnswer: {
            type: String,
            required: true
        },
        isPass: {
            type: Boolean,
            required: false
        },
        grading: {
            type: String,
            required: true
        },
        recommendations: {
            type: String,
            required: true
        }
    }],
})

const labQuestion = new mongoose.Schema({
    question: {
        type: String,
    }
})

const User = mongoose.model('User', userSchema);
const University = mongoose.model('University', universitySchema);
const Lab = mongoose.model('Lab', labSchema);
const LabQuestion = mongoose.model('LabQuestion', labQuestion);

module.exports = {
	User,
    University,
    Lab,
    LabQuestion
};