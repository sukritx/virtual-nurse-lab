const express = require('express');
const router = express.Router();
const { User, University, LabSubmission, LabInfo } = require('../db');
const { professorAuth } = require('../middleware');

router.get('/university', professorAuth, async (req, res) => {
  try {
    const university = await University.findOne({ professor: { $in: [req.userId] } })
      .populate('students', 'firstName lastName studentId')
      .select('universityName numberOfStudents students');

    if (!university) {
      return res.status(404).json({ message: 'University not found' });
    }

    res.json(university);
  } catch (error) {
    console.error('Error fetching university data:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// get each student lab info
router.get('/students', professorAuth, async (req, res) => {
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

// get students' lab info
router.get('/labs', professorAuth, async (req, res) => {
  try {
    const university = await University.findOne({ professor: { $in: [req.userId] } })
      .populate('students', 'firstName lastName studentId')
      .select('students');

    if (!university) {
      return res.status(404).json({ message: 'University not found' });
    }

    const students = university.students;

    const allLabs = await LabInfo.find().exec();

    const labStats = allLabs.map(lab => ({
      labNumber: lab.labNumber,
      completed: 0,
      total: students.length
    }));

    const studentLabStatuses = [];

    for (const student of students) {
      const studentLabs = await LabSubmission.find({ studentId: student._id }).populate('labInfo').exec();

      const labsStatus = allLabs.map(lab => {
        const studentLab = studentLabs.find(sl => sl.labInfo._id.equals(lab._id));
        if (studentLab) {
          if (studentLab.isPass) {
            labStats.find(stat => stat.labNumber === lab.labNumber).completed++;
          }
          return {
            labNumber: lab.labNumber,
            isPass: studentLab.isPass,
            attempt: studentLab.attempt
          };
        } else {
          return {
            labNumber: lab.labNumber,
            isPass: null,
            attempt: 0
          };
        }
      });

      studentLabStatuses.push({
        studentId: student.studentId,
        firstName: student.firstName,
        lastName: student.lastName,
        labsStatus
      });
    }

    res.json({ labStats, studentLabStatuses });
  } catch (error) {
    console.error('Error fetching labs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;