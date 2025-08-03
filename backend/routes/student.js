const express = require('express');
const router = express.Router();
const { User, LabSubmission, LabInfo } = require('../db');
const { authMiddleware } = require('../middleware');

router.get('/labs', authMiddleware, async (req, res) => {
    try {
        const studentLabs = await LabSubmission.find({ studentId: req.userId }).populate('labInfo').exec();
        const allLabs = await LabInfo.find({ subject: 'maternalandchild' }).sort({ labNumber: 1 });

        const MAX_ATTEMPTS = 3; // Define max attempts

        // Map to hold lab status
        const labsStatus = allLabs.map(lab => {
            const studentLabSubmissions = studentLabs.filter(sl => sl.labInfo._id.equals(lab._id));
            const attemptsMade = studentLabSubmissions.length;
            const attemptsLeft = Math.max(0, MAX_ATTEMPTS - attemptsMade);
            const latestSubmission = studentLabSubmissions[studentLabSubmissions.length - 1];
            const everPassed = studentLabSubmissions.some(submission => submission.isPass);
            
            return {
                labInfo: lab,
                isPass: latestSubmission ? latestSubmission.isPass : null,
                everPassed: everPassed,
                attempt: attemptsMade,
                attemptsLeft: attemptsLeft
            };
        });

        res.json({ labs: labsStatus });
    } catch (error) {
        console.error('Error fetching labs:', error);
        res.status(500).json({ message: 'Error fetching labs' });
    }
});

// used by both maternalandchild and 315
router.get('/:subject/:labNumber/history', authMiddleware, async (req, res) => {
    try {
        const studentId = req.userId;
        const { subject, labNumber } = req.params;

        const labInfo = await LabInfo.findOne({ labNumber, subject });
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

// 315
router.get('/315/labs', authMiddleware, async (req, res) => {
    try {
        const studentId = req.userId;
        const labSubmissions = await LabSubmission.find({ studentId }).populate('labInfo').exec();
        const allLabs = await LabInfo.find({ subject: '315' }).sort({ labNumber: 1 });

        const MAX_ATTEMPTS = 3; // Define max attempts

        // Map to hold lab status
        const labsStatus = allLabs.map(lab => {
            const studentLabSubmissions = labSubmissions.filter(sl => sl.labInfo._id.equals(lab._id));
            const attemptsMade = studentLabSubmissions.length;
            const attemptsLeft = Math.max(0, MAX_ATTEMPTS - attemptsMade);
            const latestSubmission = studentLabSubmissions[studentLabSubmissions.length - 1];
            const everPassed = studentLabSubmissions.some(submission => submission.isPass);
            
            return {
                labInfo: lab,
                isPass: latestSubmission ? latestSubmission.isPass : null,
                everPassed: everPassed,
                attempt: attemptsMade,
                attemptsLeft: attemptsLeft
            };
        });

        res.json({ labs: labsStatus });
    } catch (error) {
        console.error('Error fetching labs:', error);
        res.status(500).json({ message: 'Error fetching labs' });
    }
});

// trial cssd
router.get('/trial-cssd/labs', authMiddleware, async (req, res) => {
    try {
        const studentId = req.userId;
        const labSubmissions = await LabSubmission.find({ studentId }).populate('labInfo').exec();
        const allLabs = await LabInfo.find({ subject: 'trial-cssd' }).sort({ labNumber: 1 });

        const MAX_ATTEMPTS = 3; // Define max attempts

        // Map to hold lab status
        const labsStatus = allLabs.map(lab => {
            const studentLabSubmissions = labSubmissions.filter(sl => sl.labInfo._id.equals(lab._id));
            const attemptsMade = studentLabSubmissions.length;
            const attemptsLeft = Math.max(0, MAX_ATTEMPTS - attemptsMade);
            const latestSubmission = studentLabSubmissions[studentLabSubmissions.length - 1];
            const everPassed = studentLabSubmissions.some(submission => submission.isPass);
            
            return {
                labInfo: lab,
                isPass: latestSubmission ? latestSubmission.isPass : null,
                everPassed: everPassed,
                attempt: attemptsMade,
                attemptsLeft: attemptsLeft
            };
        });

        res.json({ labs: labsStatus });
    } catch (error) {
        console.error('Error fetching labs:', error);
        res.status(500).json({ message: 'Error fetching labs' });
    }
});

module.exports = router;
