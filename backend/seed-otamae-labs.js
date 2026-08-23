require('dotenv').config();
const mongoose = require('mongoose');
const { LabInfo } = require('./db');

async function seedOtamaeLabs() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const labs = [];
        for (let labNumber = 1; labNumber <= 10; labNumber++) {
            labs.push({ labName: `Otamae Lab ${labNumber}`, labNumber, subject: 'otamae' });
        }

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

seedOtamaeLabs();
