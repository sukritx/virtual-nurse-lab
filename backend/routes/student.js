const express = require('express');
const router = express.Router();
const { User, LabSubmission, LabInfo } = require('../db');
const { authMiddleware } = require('../middleware');

router.get('/labs', authMiddleware, async (req, res) => {
    try {
        const studentLabs = await LabSubmission.find({ studentId: req.userId }).populate('labInfo').exec();
        const allLabs = await LabInfo.find().sort({ labNumber: 1 });

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

router.get('/:labNumber/history', authMiddleware, async (req, res) => {
    try {
        const studentId = req.userId;
        const { labNumber } = req.params;

        const labInfo = await LabInfo.findOne({ labNumber });
        if (!labInfo) {
            return res.status(404).json({ message: 'Lab not found' });
        }

        const labSubmissions = await LabSubmission.find({ studentId, labInfo: labInfo._id }).sort({ attempt: 1 }).exec();
        res.json({ labSubmissions });
    } catch (error) {
        console.error('Error fetching lab history:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
