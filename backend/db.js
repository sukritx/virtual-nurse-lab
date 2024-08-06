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

const labSubmissionSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    labInfo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LabInfo',
        required: true
    },
    filePath: {
        type: String,
        required: true
    },
    fileType: {
        type: String,
        required: false
    },
    studentAnswer: {
        type: String,
        required: true
    },
    studentScore: {
        type: Number,
        required: true
    },
    isPass: {
        type: Boolean,
        required: false
    },
    pros: {
        type: String,
        required: true
    },
    recommendations: {
        type: String,
        required: true
    },
    attempt: {
        type: Number,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

const labInfoSchema = new mongoose.Schema({
    labName: {
        type: String,
    },
    labNumber: {
        type: Number,
        required: true
    },
    subject: {
        type: String,
        required: true
    },
});

const User = mongoose.model('User', userSchema);
const University = mongoose.model('University', universitySchema);
const LabSubmission = mongoose.model('LabSubmission', labSubmissionSchema);
const LabInfo = mongoose.model('LabInfo', labInfoSchema);

module.exports = {
	User,
    University,
    LabSubmission,
    LabInfo
};