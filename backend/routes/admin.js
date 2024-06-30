const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { User, University } = require('../db');
const crypto = require('crypto');
const { adminAuth } = require('../middleware')


// admin generate university's registercode
const generateUniqueCode = () => {
    return crypto.randomBytes(3).toString('hex'); // Generate a 6-character hex string
};

router.post('/generate-code', adminAuth, async (req, res) => {
    const { universityName, numberOfStudents } = req.body;

    if (!universityName || !numberOfStudents) {
        return res.status(400).json({ message: 'University name and number of students are required.' });
    }

    try {
        // Generate a unique registration code
        let registerCode;
        let isUnique = false;

        while (!isUnique) {
            registerCode = generateUniqueCode();
            const existingUniversity = await University.findOne({ registerCode });
            if (!existingUniversity) {
                isUnique = true;
            }
        }

        // Create a new university document
        const newUniversity = new University({
            universityName,
            numberOfStudents,
            registerCode,
            students: [],
            professors: []
        });

        // Save the university to the database
        await newUniversity.save();

        res.status(201).json({ registerCode });
    } catch (error) {
        console.error('Error generating university code:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// admin assign professor role and remove from student's university schema
router.post('/assign-professor', adminAuth, async (req, res) => {
    const { registerCode, professorUsername } = req.body;

    try {
        // Find the university by register code
        const university = await University.findOne({ registerCode });
        if (!university) {
            return res.status(404).json({ message: 'University not found' });
        }

        // Find the user by username (professorName)
        const professor = await User.findOne({ username: professorUsername });
        if (!professor) {
            return res.status(404).json({ message: 'Professor not found' });
        }

        // Update user to be a professor and remove from university students
        professor.isProfessor = true;
        await professor.save();

        // Remove the professor from the university's students list
        university.students = university.students.filter(studentId => !studentId.equals(professor._id));
        // Add the professor to the university's professor list
        university.professor.push(professor._id);
        await university.save();

        return res.json({ message: 'Professor assigned successfully' });
    } catch (error) {
        console.error('Error assigning professor:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

// get all universities
router.get('/universities', adminAuth, async (req, res) => {
    try {
        const universities = await University.find().select('universityName numberOfStudents students registerCode');
        res.json(universities);
    } catch (error) {
        console.error('Error fetching universities:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
})

module.exports = router;