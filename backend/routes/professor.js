const express = require('express');
const router = express.Router();
const { University } = require('../db');
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

module.exports = router;