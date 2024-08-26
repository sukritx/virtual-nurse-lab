const express = require('express');
const router = express.Router();
const { User, University, LabSubmission, LabInfo } = require('../db');
const { professorAuth } = require('../middleware');
const { createObjectCsvStringifier } = require('csv-writer');

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
      .populate('students', '_id firstName lastName studentId')
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
      const studentLabs = await LabSubmission.aggregate([
        { $match: { studentId: student._id } },
        { $sort: { timestamp: -1 } },
        {
          $group: {
            _id: "$labInfo",
            submissions: { $push: "$$ROOT" }
          }
        },
        {
          $lookup: {
            from: "labinfos",
            localField: "_id",
            foreignField: "_id",
            as: "labInfo"
          }
        },
        { $unwind: "$labInfo" }
      ]);

      const labsStatus = allLabs.map(lab => {
        const studentLab = studentLabs.find(sl => sl._id.equals(lab._id));
        if (studentLab) {
          const hasPassed = studentLab.submissions.some(submission => submission.isPass);
          if (hasPassed) {
            labStats.find(stat => stat.labNumber === lab.labNumber).completed++;
          }
          return {
            labNumber: lab.labNumber,
            isPass: hasPassed,
            attempt: studentLab.submissions.length
          };
        } else {
          return {
            labNumber: lab.labNumber,
            isPass: false,
            attempt: 0
          };
        }
      });

      studentLabStatuses.push({
        _id: student._id,
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
router.get('/student/:userId/labs', professorAuth, async (req, res) => {
  try {
    const student = await User.findOne({ _id: req.params.userId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const university = student.university ? await University.findOne({ universityName: student.university }) : null;

    const labInfos = await LabInfo.find().select('labNumber');
    const labSubmissions = await LabSubmission.find({ studentId: student._id })
      .sort({ timestamp: -1 }) // Sort by timestamp in descending order
      .select('labInfo isPass timestamp');

    const labs = labInfos.map(labInfo => {
      const submissions = labSubmissions.filter(sub => sub.labInfo.equals(labInfo._id));
      const latestSubmission = submissions[0]; // Get the latest submission
      return {
        labNumber: labInfo.labNumber,
        isPass: latestSubmission ? latestSubmission.isPass : null
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
router.get('/student/:userId/lab/:labNumber', professorAuth, async (req, res) => {
  try {
    const student = await User.findOne({ _id: req.params.userId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const labInfo = await LabInfo.findOne({ labNumber: req.params.labNumber });
    if (!labInfo) {
      return res.status(404).json({ message: 'Lab not found' });
    }

    const labSubmissions = await LabSubmission.find({ studentId: student._id, labInfo: labInfo._id })
      .sort({ attempt: 1 })
      .exec();

    if (labSubmissions.length === 0) {
      return res.status(404).json({ message: 'No lab submissions found' });
    }

    res.json({ labSubmissions });
  } catch (error) {
    console.error('Error fetching lab details:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/download-scores', professorAuth, async (req, res) => {
  try {
    // Get the professor's university
    const professor = await User.findById(req.userId);
    if (!professor || !professor.isProfessor) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const university = await University.findOne({ professor: professor._id });
    if (!university) {
      return res.status(404).json({ message: 'University not found' });
    }

    // Fetch all students from the professor's university
    const students = await User.find({ 
      _id: { $in: university.students },
      isProfessor: false, 
      isAdmin: false 
    });

    // Fetch all lab infos
    const labInfos = await LabInfo.find().sort('labNumber');

    // Prepare data for CSV
    const data = await Promise.all(students.map(async (student) => {
      const scores = await Promise.all(labInfos.map(async (labInfo) => {
        const submission = await LabSubmission.findOne({
          studentId: student._id,
          labInfo: labInfo._id
        }).sort('-attempt');
        return submission ? submission.studentScore : '0';
      }));

      return {
        StudentID: student.studentId,
        FullName: `${student.firstName} ${student.lastName}`,
        ...Object.fromEntries(scores.map((score, index) => [`Score_${(index + 1).toString().padStart(2, '0')}`, score]))
      };
    }));

    // Create CSV
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'StudentID', title: 'Student ID' },
        { id: 'FullName', title: 'Full Name' },
        ...labInfos.map((_, index) => ({ id: `Score_${(index + 1).toString().padStart(2, '0')}`, title: `Score_${(index + 1).toString().padStart(2, '0')}` }))
      ]
    });

    const csvString = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(data);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=student_scores.csv');
    res.send(csvString);
  } catch (error) {
    console.error('Error generating CSV:', error);
    res.status(500).json({ message: 'Error generating CSV' });
  }
});

module.exports = router;