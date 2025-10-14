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

    const allLabs = await LabInfo.find({ subject: 'maternalandchild' }).sort({ labNumber: 1 }).exec();

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
            submissions: { $push: "$$ROOT" },
            latestSubmission: { $first: "$$ROOT" }
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
          const hasPassed = studentLab.submissions.some(sub => sub.isPass);
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

    const labInfos = await LabInfo.find({ subject: 'maternalandchild' }).select('labNumber');
    const labSubmissions = await LabSubmission.aggregate([
      { $match: { studentId: student._id } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: "$labInfo",
          submissions: { $push: "$$ROOT" },
          latestSubmission: { $first: "$$ROOT" }
        }
      }
    ]);

    const labs = labInfos.map(labInfo => {
      const labSubmission = labSubmissions.find(sub => sub._id.equals(labInfo._id));
      if (labSubmission) {
        const hasPassed = labSubmission.submissions.some(sub => sub.isPass);
        return {
          labNumber: labInfo.labNumber,
          isPass: hasPassed,
          latestAttempt: {
            isPass: labSubmission.latestSubmission.isPass,
            timestamp: labSubmission.latestSubmission.timestamp
          },
          attemptCount: labSubmission.submissions.length
        };
      } else {
        return {
          labNumber: labInfo.labNumber,
          isPass: null,
          latestAttempt: null,
          attemptCount: 0
        };
      }
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

    const labInfo = await LabInfo.findOne({ labNumber: req.params.labNumber, subject: 'maternalandchild' });
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
    // Get the professor's details
    const professor = await User.findById(req.userId);
    if (!professor || !professor.isProfessor) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    // Determine the subject based on professor's universityCode
    let subjectFilter = {}; // Default to empty, meaning no subject filter (though we'll add one)

    if (professor.universityCode) {
      const upperUniversityCode = professor.universityCode.toUpperCase();
      if (upperUniversityCode.startsWith("SUR")) {
        subjectFilter = { subject: "surgical" }; // Assuming your LabInfo 'subject' field stores "Surgical"
      } else if (upperUniversityCode.startsWith("MED")) {
        subjectFilter = { subject: "medical" }; // Assuming your LabInfo 'subject' field stores "Medical"
      } else if (upperUniversityCode.startsWith("OB")) {
        subjectFilter = { subject: "ob" };       // Assuming your LabInfo 'subject' field stores "OB"
      }
      // Add more else if blocks here if you have other prefixes (e.g., '315' for 'Subject315')
      else if (professor.university === 'Subject315') {
          subjectFilter = { subject: 'Subject315' }; // Assuming LabInfo also uses 'Subject315'
      }
    } else {
        // If professor has no universityCode, but has a university (e.g., 'Subject315')
        if (professor.university === 'Subject315') {
            subjectFilter = { subject: 'Subject315' };
        } else {
            // If no specific universityCode or university is found, what should happen?
            // Option 1: Return an error
            return res.status(400).json({ message: "Professor's subject could not be determined." });
            // Option 2: Fallback to a default subject or all labs (less secure/desired)
            // subjectFilter = {}; // This would get all labs again. Not what you want.
        }
    }

    // Fetch relevant lab infos based on the determined subject
    // Add the subjectFilter to the find query
    const labInfos = await LabInfo.find(subjectFilter).sort('labNumber');

    if (labInfos.length === 0) {
        return res.status(404).json({ message: `No labs found for subject: ${subjectFilter.subject || 'unknown'}` });
    }

    // The rest of the logic remains largely the same, but now it only processes
    // students for the relevant labs.

    // Get the professor's university
    // This part seems redundant if professor has their own `university` and `universityCode`
    // However, if University model is used to link students to professors, keep it.
    // For now, assuming professor.students directly links students to the professor's "group"
    // or you filter by the university's registered students.
    // Re-evaluating based on the `universitySchema`: it has `students: [{type: ObjectId, ref: 'User'}]`
    // This suggests that a university _object_ groups students.
    // Let's ensure we fetch students belonging to this professor's university.

    const professorsUniversity = await University.findOne({
        // We need a way to link the professor to their university.
        // Assuming `professor.universityCode` or `professor.university` can match `University.registerCode` or `University.universityName`.
        // If `universityCode` in `User` is a specific `registerCode` from `University` schema, use that.
        // For 'Subject315', you have `university: "Subject315"`.
        // Let's assume professor.universityCode should match University.registerCode.
        // Or, if a professor belongs to a university and has their _id in the `professor` array of a `University` document.
        professor: professor._id // This is the most direct link based on your schema
    });

    if (!professorsUniversity) {
        return res.status(404).json({ message: 'Professor is not associated with any university.' });
    }


    // Fetch all students from the professor's associated university
    const students = await User.find({
      _id: { $in: professorsUniversity.students }, // Filter students by the ones associated with THIS professor's university
      isProfessor: false,
      isAdmin: false
    });

    // Prepare data for CSV
    const data = await Promise.all(students.map(async (student) => {
      // Collect scores only for the filtered labInfos
      const scores = await Promise.all(labInfos.map(async (labInfo) => {
        const submission = await LabSubmission.findOne({
          studentId: student._id,
          labInfo: labInfo._id // Use the filtered labInfo._id
        }).sort('-attempt');
        return submission ? submission.studentScore : '0';
      }));

      // Dynamically create header IDs and titles for scores based on filtered labs
      const scoreEntries = Object.fromEntries(labInfos.map((labInfo, index) =>
        [`Score_${labInfo.labNumber.toString().padStart(2, '0')}`, scores[index]]
      ));

      return {
        StudentID: student.studentId,
        FullName: `${student.firstName} ${student.lastName}`,
        ...scoreEntries
      };
    }));

    // Create CSV
    // Dynamically generate header based on the filtered labInfos
    const csvHeader = [
      { id: 'StudentID', title: 'Student ID' },
      { id: 'FullName', title: 'Full Name' },
      ...labInfos.map(labInfo => ({ id: `Score_${labInfo.labNumber.toString().padStart(2, '0')}`, title: `Score_${labInfo.labNumber.toString().padStart(2, '0')}` }))
    ];

    const csvStringifier = createObjectCsvStringifier({ header: csvHeader });

    const csvString = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(data);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=student_scores.csv');
    res.send(csvString);
  } catch (error) {
    console.error('Error generating CSV:', error);
    res.status(500).json({ message: 'Error generating CSV' });
  }
});

/* Subject 315 */
// get students' Subject315 lab info
router.get('/315/labs', professorAuth, async (req, res) => {
  try {
    const university = await University.findOne({ professor: { $in: [req.userId] } })
      .populate('students', '_id firstName lastName studentId')
      .select('students');

    if (!university) {
      return res.status(404).json({ message: 'University not found' });
    }

    const students = university.students;

    const allLabs = await LabInfo.find({ subject: '315' }).sort({ labNumber: 1 }).exec();

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
            submissions: { $push: "$$ROOT" },
            latestSubmission: { $first: "$$ROOT" }
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
          const hasPassed = studentLab.submissions.some(sub => sub.isPass);
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
// Get all labs of Subject315 for a specific student
router.get('/student/:userId/315/labs', professorAuth, async (req, res) => {
  try {
    const student = await User.findOne({ _id: req.params.userId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const university = student.university ? await University.findOne({ universityName: student.university }) : null;

    const labInfos = await LabInfo.find({ subject: '315' }).select('labNumber');
    const labSubmissions = await LabSubmission.aggregate([
      { $match: { studentId: student._id } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: "$labInfo",
          submissions: { $push: "$$ROOT" },
          latestSubmission: { $first: "$$ROOT" }
        }
      }
    ]);

    const labs = labInfos.map(labInfo => {
      const labSubmission = labSubmissions.find(sub => sub._id.equals(labInfo._id));
      if (labSubmission) {
        const hasPassed = labSubmission.submissions.some(sub => sub.isPass);
        return {
          labNumber: labInfo.labNumber,
          isPass: hasPassed,
          latestAttempt: {
            isPass: labSubmission.latestSubmission.isPass,
            timestamp: labSubmission.latestSubmission.timestamp
          },
          attemptCount: labSubmission.submissions.length
        };
      } else {
        return {
          labNumber: labInfo.labNumber,
          isPass: null,
          latestAttempt: null,
          attemptCount: 0
        };
      }
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
// Get details of a specific lab of Subject315 for a specific student
router.get('/student/:userId/lab/315/:labNumber', professorAuth, async (req, res) => {
  try {
    const student = await User.findOne({ _id: req.params.userId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const labInfo = await LabInfo.findOne({ labNumber: req.params.labNumber, subject: '315' });
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

/* VNL 2025 */
// get students' SURGICAL lab info
router.get('/surgical/labs', professorAuth, async (req, res) => {
  try {
    const university = await University.findOne({ professor: { $in: [req.userId] } })
      .populate('students', '_id firstName lastName studentId')
      .select('students');

    if (!university) {
      return res.status(404).json({ message: 'University not found' });
    }

    const students = university.students;

    const allLabs = await LabInfo.find({ subject: 'surgical' }).sort({ labNumber: 1 }).exec();

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
            submissions: { $push: "$$ROOT" },
            latestSubmission: { $first: "$$ROOT" }
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
          const hasPassed = studentLab.submissions.some(sub => sub.isPass);
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
// get students' MEDICAL lab info
router.get('/medical/labs', professorAuth, async (req, res) => {
  try {
    const university = await University.findOne({ professor: { $in: [req.userId] } })
      .populate('students', '_id firstName lastName studentId')
      .select('students');

    if (!university) {
      return res.status(404).json({ message: 'University not found' });
    }

    const students = university.students;

    const allLabs = await LabInfo.find({ subject: 'medical' }).sort({ labNumber: 1 }).exec();

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
            submissions: { $push: "$$ROOT" },
            latestSubmission: { $first: "$$ROOT" }
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
          const hasPassed = studentLab.submissions.some(sub => sub.isPass);
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
// get students' OB lab info
router.get('/ob/labs', professorAuth, async (req, res) => {
  try {
    const university = await University.findOne({ professor: { $in: [req.userId] } })
      .populate('students', '_id firstName lastName studentId')
      .select('students');

    if (!university) {
      return res.status(404).json({ message: 'University not found' });
    }

    const students = university.students;

    const allLabs = await LabInfo.find({ subject: 'ob' }).sort({ labNumber: 1 }).exec();

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
            submissions: { $push: "$$ROOT" },
            latestSubmission: { $first: "$$ROOT" }
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
          const hasPassed = studentLab.submissions.some(sub => sub.isPass);
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

// Get all labs of SURGICAL for a specific student
router.get('/student/:userId/surgical/labs', professorAuth, async (req, res) => {
  try {
    const student = await User.findOne({ _id: req.params.userId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const university = student.university ? await University.findOne({ universityName: student.university }) : null;

    const labInfos = await LabInfo.find({ subject: 'surgical' }).select('labNumber');
    const labSubmissions = await LabSubmission.aggregate([
      { $match: { studentId: student._id } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: "$labInfo",
          submissions: { $push: "$$ROOT" },
          latestSubmission: { $first: "$$ROOT" }
        }
      }
    ]);

    const labs = labInfos.map(labInfo => {
      const labSubmission = labSubmissions.find(sub => sub._id.equals(labInfo._id));
      if (labSubmission) {
        const hasPassed = labSubmission.submissions.some(sub => sub.isPass);
        return {
          labNumber: labInfo.labNumber,
          isPass: hasPassed,
          latestAttempt: {
            isPass: labSubmission.latestSubmission.isPass,
            timestamp: labSubmission.latestSubmission.timestamp
          },
          attemptCount: labSubmission.submissions.length
        };
      } else {
        return {
          labNumber: labInfo.labNumber,
          isPass: null,
          latestAttempt: null,
          attemptCount: 0
        };
      }
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
// Get all labs of MEDICAL for a specific student
router.get('/student/:userId/medical/labs', professorAuth, async (req, res) => {
  try {
    const student = await User.findOne({ _id: req.params.userId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const university = student.university ? await University.findOne({ universityName: student.university }) : null;

    const labInfos = await LabInfo.find({ subject: 'medical' }).select('labNumber');
    const labSubmissions = await LabSubmission.aggregate([
      { $match: { studentId: student._id } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: "$labInfo",
          submissions: { $push: "$$ROOT" },
          latestSubmission: { $first: "$$ROOT" }
        }
      }
    ]);

    const labs = labInfos.map(labInfo => {
      const labSubmission = labSubmissions.find(sub => sub._id.equals(labInfo._id));
      if (labSubmission) {
        const hasPassed = labSubmission.submissions.some(sub => sub.isPass);
        return {
          labNumber: labInfo.labNumber,
          isPass: hasPassed,
          latestAttempt: {
            isPass: labSubmission.latestSubmission.isPass,
            timestamp: labSubmission.latestSubmission.timestamp
          },
          attemptCount: labSubmission.submissions.length
        };
      } else {
        return {
          labNumber: labInfo.labNumber,
          isPass: null,
          latestAttempt: null,
          attemptCount: 0
        };
      }
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
// Get all labs of OB for a specific student
router.get('/student/:userId/ob/labs', professorAuth, async (req, res) => {
  try {
    const student = await User.findOne({ _id: req.params.userId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const university = student.university ? await University.findOne({ universityName: student.university }) : null;

    const labInfos = await LabInfo.find({ subject: 'ob' }).select('labNumber');
    const labSubmissions = await LabSubmission.aggregate([
      { $match: { studentId: student._id } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: "$labInfo",
          submissions: { $push: "$$ROOT" },
          latestSubmission: { $first: "$$ROOT" }
        }
      }
    ]);

    const labs = labInfos.map(labInfo => {
      const labSubmission = labSubmissions.find(sub => sub._id.equals(labInfo._id));
      if (labSubmission) {
        const hasPassed = labSubmission.submissions.some(sub => sub.isPass);
        return {
          labNumber: labInfo.labNumber,
          isPass: hasPassed,
          latestAttempt: {
            isPass: labSubmission.latestSubmission.isPass,
            timestamp: labSubmission.latestSubmission.timestamp
          },
          attemptCount: labSubmission.submissions.length
        };
      } else {
        return {
          labNumber: labInfo.labNumber,
          isPass: null,
          latestAttempt: null,
          attemptCount: 0
        };
      }
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

// Get details of a specific lab of SURGICAL for a specific student
router.get('/student/:userId/lab/surgical/:labNumber', professorAuth, async (req, res) => {
  try {
    const student = await User.findOne({ _id: req.params.userId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const labInfo = await LabInfo.findOne({ labNumber: req.params.labNumber, subject: 'surgical' });
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
// Get details of a specific lab of MEDICAL for a specific student
router.get('/student/:userId/lab/medical/:labNumber', professorAuth, async (req, res) => {
  try {
    const student = await User.findOne({ _id: req.params.userId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const labInfo = await LabInfo.findOne({ labNumber: req.params.labNumber, subject: 'medical' });
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
// Get details of a specific lab of OB for a specific student
router.get('/student/:userId/lab/ob/:labNumber', professorAuth, async (req, res) => {
  try {
    const student = await User.findOne({ _id: req.params.userId });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const labInfo = await LabInfo.findOne({ labNumber: req.params.labNumber, subject: 'ob' });
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

module.exports = router;