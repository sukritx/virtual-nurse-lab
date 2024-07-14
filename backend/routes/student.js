const express = require('express');
const router = express.Router();
const { User, LabSubmission, LabInfo } = require('../db');
const { authMiddleware } = require('../middleware');

router.get('/labs', authMiddleware, async (req, res) => {
    try {
        const studentLabs = await LabSubmission.find({ studentId: req.userId }).populate('labInfo').exec();
        const allLabs = await LabInfo.find();

        // Map to hold lab status
        const labsStatus = allLabs.map(lab => {
            const studentLab = studentLabs.find(sl => sl.labInfo._id.equals(lab._id));
            return {
                labInfo: lab,
                isPass: studentLab ? studentLab.isPass : null,
                attempt: studentLab ? studentLab.attempt : 0,
            };
        });

        res.json({ labs: labsStatus });
    } catch (error) {
        console.error('Error fetching labs:', error);
        res.status(500).json({ message: 'Error fetching labs' });
    }
});

module.exports = router;
