require('dotenv').config();
const mongoose = require('mongoose');
const { LabInfo } = require('./db');

async function seedFundamentalLabs() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const labs = [
            { labName: 'Fundamental Lab 1', labNumber: 1, subject: 'fundamental' },
            { labName: 'Fundamental Lab 2', labNumber: 2, subject: 'fundamental' },
            { labName: 'Fundamental Lab 3', labNumber: 3, subject: 'fundamental' },
        ];

        for (const lab of labs) {
            const existing = await LabInfo.findOne({ labNumber: lab.labNumber, subject: lab.subject });
            if (!existing) {
                await LabInfo.create(lab);
                console.log(`Created LabInfo: ${lab.subject} lab ${lab.labNumber}`);
            } else {
                console.log(`LabInfo already exists: ${lab.subject} lab ${lab.labNumber}`);
            }
        }

        console.log('Seeding complete');
    } catch (error) {
        console.error('Error seeding labs:', error);
    } finally {
        await mongoose.disconnect();
    }
}

seedFundamentalLabs();
