const express = require('express');
const router = express.Router();
const { User, University } = require('../db');
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

module.exports = router;