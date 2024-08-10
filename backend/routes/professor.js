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

    const allLabs = await LabInfo.find().sort({ labNumber: 1 }).exec();

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

// Get all labs for a specific student
router.get('/student/:studentId/labs', professorAuth, async (req, res) => {
  try {
    const student = await User.findOne({ studentId: req.params.studentId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const university = student.university ? await University.findOne({ universityName: student.university }) : null;

    const labInfos = await LabInfo.find().select('labNumber');
    const labSubmissions = await LabSubmission.find({ studentId: student._id }).select('labInfo isPass');

    const labs = labInfos.map(labInfo => {
      const submission = labSubmissions.find(sub => sub.labInfo.equals(labInfo._id));
      return {
        labNumber: labInfo.labNumber,
        isPass: submission ? submission.isPass : null
      };
    });

    res.json({
      student: {
        firstName: student.firstName,
        lastName: student.lastName,
        studentId: student.studentId,
        university: university ? university.universityName : 'N/A'
      },
      labs
    });
  } catch (error) {
    console.error('Error fetching student labs:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get details of a specific lab for a specific student
router.get('/student/:studentId/lab/:labNumber', professorAuth, async (req, res) => {
  try {
    const student = await User.findOne({ studentId: req.params.studentId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const labInfo = await LabInfo.findOne({ labNumber: req.params.labNumber });
    if (!labInfo) {
      return res.status(404).json({ message: 'Lab not found' });
    }

    const labSubmission = await LabSubmission.findOne({ studentId: student._id, labInfo: labInfo._id });
    if (!labSubmission) {
      return res.status(404).json({ message: 'Lab submission not found' });
    }

    res.json({ lab: labSubmission });
  } catch (error) {
    console.error('Error fetching lab details:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;