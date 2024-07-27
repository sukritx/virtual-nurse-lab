const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const FormData = require('form-data');
const mongoose = require('mongoose');

const { User, LabSubmission, LabInfo } = require('../db');
const { authMiddleware, fileSizeErrorHandler } = require('../middleware');

require('dotenv').config();

const OpenAI = require('openai');

// Set up ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Set up multer for file upload
const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 500000000 }, // 500MB file size limit
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    }
}).single('video');

function checkFileType(file, cb) {
    const filetypes = /mp4|mp3|mov/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetypes = /video\/mp4|audio\/mp3|video\/quicktime/;
    const mimetype = mimetypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Error: MP4, MOV, or MP3 Files Only!'));
    }
}

// Function to compress video
async function compressVideo(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .output(outputPath)
            .videoCodec('libx264')
            .audioCodec('aac')
            .size('640x?') // Change resolution for smaller file size
            .on('end', resolve)
            .on('error', reject)
            .run();
    });
}

async function processFile(filePath) {
    let audioPath = filePath;

    // Extract audio if the file is MP4 or MOV
    if (['.mp4', '.mov'].includes(path.extname(filePath).toLowerCase())) {
        audioPath = `./public/uploads/audio-${Date.now()}.mp3`;

        await new Promise((resolve, reject) => {
            ffmpeg(filePath)
                .output(audioPath)
                .audioCodec('libmp3lame')
                .on('end', resolve)
                .on('error', reject)
                .run();
        });
    }

    // Transcribe the audio file using iapp.co.th API
    const transcription = await transcribeAudioIApp(audioPath);

    // Concatenate the text from each segment
    const transcriptionText = concatenateTranscriptionText(transcription.output);
    console.log(transcriptionText);

    return { transcription: transcriptionText };
}

async function transcribeAudioIApp(audioPath) {
    const audioData = fs.createReadStream(audioPath);
    let data = new FormData();
    data.append('file', audioData);

    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://api.iapp.co.th/asr/v3',
        headers: { 
            'apikey': process.env.IAPP_API_KEY, 
            ...data.getHeaders()
        },
        data : data
    };

    try {
        const response = await axios.request(config);
        return response.data;
    } catch (error) {
        if (error.response) {
            console.error(`Error: ${error.response.status} - ${error.response.statusText}`);
            console.error(error.response.data);
            throw new Error(`Transcription failed: ${error.response.status} - ${error.response.statusText}`);
        } else {
            throw new Error(`Transcription failed: ${error.message}`);
        }
    }
}

function concatenateTranscriptionText(transcriptionOutput) {
    return transcriptionOutput.map(segment => segment.text).join(' ');
}

// Store student's lab data into the database
router.post('/submit-lab', async (req, res) => {
    const { studentId, labNumber, subject, videoPath, studentAnswer, studentScore, isPass, pros, recommendations } = req.body;

    // Validate studentId as ObjectId
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
        return res.status(400).json({ message: 'Invalid studentId' });
    }
    try {
        const labInfo = await LabInfo.findOne({ labNumber, subject });
        if (!labInfo) {
            return res.status(404).json({ message: 'Lab information not found' });
        }

        // Check for previous submissions and calculate the attempt number
        const previousSubmissions = await LabSubmission.find({ studentId, labInfo: labInfo._id });
        const currentAttempt = previousSubmissions.length + 1;

        const labSubmission = new LabSubmission({
            studentId,
            labInfo: labInfo._id,
            videoPath,
            studentAnswer,
            studentScore,
            isPass,
            pros,
            recommendations,
            attempt: currentAttempt
        });

        await labSubmission.save();
        res.json({ message: 'Lab information submitted successfully' });
    } catch (error) {
        console.error('Error submitting lab information:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Handle file upload and processing
router.post('/1', authMiddleware, (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ msg: err.message });
        }

        const filePath = `./public/uploads/${req.file.filename}`;
        let audioPath = null;

        try {
            // Compress the video file
            const compressedFilePath = `./public/uploads/compressed-${req.file.filename}`;
            await compressVideo(filePath, compressedFilePath);

            // Process the compressed video file
            const { transcription } = await processFile(compressedFilePath);

            // If an audio file was created, store its path
            if (['.mp4', '.mov'].includes(path.extname(filePath).toLowerCase())) {
                audioPath = `./public/uploads/audio-${Date.now()}.mp3`;
            }

            const feedbackJson = await processTranscriptionLab1(transcription);

            const labInfo = {
                studentId: req.userId,
                labNumber: 1,
                subject: 'maternalandchild',
                videoPath: compressedFilePath,
                studentAnswer: transcription,
                studentScore: feedbackJson.totalScore,
                isPass: feedbackJson.totalScore >= 50,
                pros: feedbackJson.pros,
                recommendations: feedbackJson.recommendations,
            };

            await axios.post('http://localhost:3000/api/v1/lab/submit-lab', labInfo);

            res.json({
                feedback: feedbackJson,
                transcription,
                passFailStatus: feedbackJson.totalScore >= 50 ? 'Passed' : 'Failed',
                score: feedbackJson.totalScore,
                pros: feedbackJson.pros,
                recommendations: feedbackJson.recommendations
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({ msg: 'Error processing the file' });
        } finally {
            // Delete the original uploaded video
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            // Delete the audio file if it was created
            if (audioPath && fs.existsSync(audioPath)) {
                fs.unlinkSync(audioPath);
            }
        }
    });
});
async function processTranscriptionLab1(transcription) {
    const answerKey = `
1.	ท่านจะให้คำแนะนำใดแก่มารดารายนี้ เช่น การดูดอย่างถูกวิธี  4 ดูด การแก้ไขปัญหา
เฉลย (50 คะแนน)
•	อธิบายการดูดอย่างถูกวิธี โดยเน้น การอุ้มบุตรกระชับแนบลำตัวมารดา ท้องมารดาชิดท้องบุตร หน้าบุตรเงยเล็กน้อย ลำตัวบุตรอยู่ในแนวตรง บุตรอมลึกถึงลานนม (10 คะแนน)
•	อธิบายรายละเอียดของการดูดบ่อย เช่น ดูดทุก 2-3 ชั่วโมง หรือ ดูดเมื่อบุตรต้องการ ดูดแต่ละครั้งนาน 20 นาที (10 คะแนน)
•	ให้นำบุตรดูดนมข้างที่เจ็บน้อยกว่าก่อน ในรายนี้ เริ่มจากดูดข้างซ้าย หากบุตรไม่อิ่มให้ดูดต่อที่ด้านขวา มื้อต่อไปให้ลูกดูดจากเต้าด้านขวาที่ดูดค้างไว้ (10 คะแนน)
•	เมื่อลูกอิ่ม ลูกจะคายหัวนมออก หากลูกยังดูดนมอยู่ อย่าดึงหัวนมออกจะทำให้หัวนมแตก ถ้าแม่ต้องการเอานมออกจากปากลูก ให้กดคาง หรือใช้นิ้วก้อยสอดเข้าไปในปากลูกเพื่อให้ลูกอ้าปาก แล้วคายหัวนมออก (10 คะแนน)
•	ลักษณะการกลืนอย่างถูกวิธี เช่น สังเกตการกลืนอย่างเป็นจังหวะ ไม่มีเสียงดูด ได้แต่เสียงลม (เสียงจ๊วบ จ๊วบ) (10 คะแนน)
•	อธิบายการสังเกตความเพียงพอของน้ำนม เช่น การพักหลับของบุตร จำนวนครั้งของปัสสาวะอุจจาระของบุตร สีของปัสสาวะ เป็นต้น หรือ แนะนำหลักการ 4 6 8 (5 คะแนน)
•	แนะนำการเพิ่มปริมาณน้ำนมโดยการประคบร้อนก่อนให้บุตรดูด/เข้าเต้า (5 คะแนน)
•	แนะนำการดื่มน้ำอุ่นบ่อยครั้ง (5 คะแนน)
•	อธิบายประโยชน์ของนมมารดาต่อมารดาและบุตร (5 คะแนน)
•	แนะนำอาหารประเภทเรียกน้ำนม เช่น ขิง กระเพรา ใบแมงลัก นมถั่วเหลือง เป็นต้น (5 คะแนน)

2.	ท่านจะสาธิตท่าอุ้มที่ถูกต้อง และการบรรเทา/ป้องกันการเจ็บหัวนม ให้กับมารดารายนี้อย่างไร 
เฉลย  (50 คะแนน)
•	สาธิตการอุ้มบุตรเข้าเต้าอย่างถูกต้อง ขณะนำลูกเข้าเต้า ลูกจะมีลำตัวตรง คอไม่บิด ท้องลูกแนบชิดกับท้องแม่ ลูกหันหน้าเข้าหาเต้านมแม่  มือแม่รองรับลำตัวลูกไว้  หากลูกดูดได้ถูกต้อง แม่จะไม่เจ็บหัวนม หัวนมไม่แตก จังหวะการดูดของลูก สม่ำเสมอ (30 คะแนน)
•	หลังจากดูดนม แนะนำให้มารดานำน้ำนมทาบริเวณหัวนม (10  คะแนน)
•	ท่าอุ้มที่ใช้มีได้หลายท่า ได้แก่
o	ท่าอุ้มขวางตัก (cradle hold) ลูกนอนขวางบนตัก ตะแคงเข้าหาตัวแม่ ท้องลูกแนบชิดท้องแม่ ใช้แขนพาดด้านหลังของลูก ฝ่ามือจับช้อนบริเวณก้นและต้นขา ปากลูกอยู่ตรงหัวนมพอดี ศีรษะและลำตัวลูกอยู่ในแนวตรง ศีรษะสูงกว่าลำตัวเล็กน้อย (10 คะแนน)
o	ท่าอุ้มขวางตักประยุกต์ (modified cradle hold) เปลี่ยนมือจากท่าอุ้มขวางตัก ใช้มือข้างเดียวกับที่ลูกดูดประคองเต้านม มืออีกข้างรองรับต้นคอและท้ายทอยลูก (10 คะแนน)
o	ท่าฟุตบอล (football hold) จับลูกกึ่งตะแคงกึ่งนอนหงาย มือจับที่ต้นคอและท้ายทอยลูก กอดตัวลูก กระชับกับสีข้างแม่ ให้ขาของลูกชี้ไปทางด้านหลังของแม่ ลูกดูดนมจากเต้านมข้างเดียวกับฝ่ามือที่ถูกจับ (10 คะแนน)
o	ท่านอน (side lying) แม่ลูกนอนตะแคงเข้าหากันแม่นอนศีรษะสูง หลังและสะโพกตรงให้มากที่สุด ให้ปากลูกอยู่ตรงกับหัวนมแม่ มือที่อยู่ด้านล่างประคองหลังลูก มือที่อยู่ด้นบนประคองเต้านมในช่วงแรกที่เริ่มเอาหัวนมเข้าปาก (10 คะแนน)

คะแนนเต็มเท่ากับ 100 คะแนน
`;

    const checkContent = `
นี่คือคำตอบของนักศึกษา: "${transcription}".
ที่คือเฉลย: "${answerKey}".

โปรดเปรียบเทียบคำตอบของนักศึกษากับเฉลยและให้คะแนน พร้อมทั้งอธิบายรายละเอียดสิ่งที่นักศึกษาทำได้ดีอย่างละเอียดและข้อเสนอแนะพร้อมบอกคะแนนแต่ละส่วน ตอบเป็นภาษาไทย
ไม่ต้องติในเรื่องไวยกรณ์หรือเรื่องที่ไม่เกี่ยวข้อง
โปรดแปลงผลการประเมินเป็น JSON รูปแบบดังนี้เท่านั้น:
    {
      "totalScore": <คะแนนนักศึกษาได้>,
      "pros": "<สิ่งที่นักศึกษาทำได้ดี>",
      "recommendations": "<ข้อปรับปรุงพร้อมบอกคะแนนแต่ละส่วน>"
    }
`;

    const response = await openai.chat.completions.create({
        messages: [{ role: "system", content: checkContent }],
        model: "gpt-4o",
        response_format: { "type": "json_object" }
    });

    const feedbackJson = JSON.parse(response.choices[0].message.content.trim());
    console.log(feedbackJson);
    return feedbackJson;
}

router.post('/4', authMiddleware, fileSizeErrorHandler, (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ msg: err.message });
        } 
        if (!req.file) {
            return res.status(400).json({ msg: 'No file selected!' });
        }

        const filePath = `./public/uploads/${req.file.filename}`;

        try {
            // Compress the video file
            const compressedFilePath = `./public/uploads/compressed-${req.file.filename}`;
            await compressVideo(filePath, compressedFilePath);

            // Delete the original uploaded video
            fs.unlinkSync(filePath);

            // Process the compressed video file
            const { transcription } = await processFile(compressedFilePath);

            const feedbackJson = await processTranscriptionLab4(transcription);

            const labInfo = {
                studentId: req.userId,
                labNumber: 4,
                subject: 'maternalandchild',
                videoPath: compressedFilePath,
                studentAnswer: transcription,
                studentScore: feedbackJson.totalScore,
                isPass: feedbackJson.totalScore >= 50,
                pros: feedbackJson.pros,
                recommendations: feedbackJson.recommendations,
            };

            await axios.post('http://localhost:3000/api/v1/lab/submit-lab', labInfo);

            res.json({
                feedback: feedbackJson,
                transcription,
                passFailStatus: feedbackJson.totalScore >= 50 ? 'Passed' : 'Failed',
                score: feedbackJson.totalScore,
                pros: feedbackJson.pros,
                recommendations: feedbackJson.recommendations
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ msg: 'Error processing the file' });
        }
    });
});
async function processTranscriptionLab4(transcription) {
    const answerKey = `
1.	ในฐานะนักศึกษาพยาบาลในหอผู้ป่วยหลังคลอด จะให้คำแนะนำเกี่ยวกับวิธีการคุมกำเนิดที่เหมาะสมแก่มารดาหลังคลอดรายนี้อย่างไร แนะนำ 3 วิธี (15 คะแนน) 
เฉลย หากเลือกตอบคำตอบใดคำตอบหนึ่งในรายการนี้ ได้คำตอบละ 5 คะแนน
•	Minipills
•	Injection
•	Contraceptive Implant
•	Abstinence
•	Lactation Amenorrhea method
•	condom
2.	หากมารดาหลังคลอดรายนี้ กำลังพิจารณาเลือกใช้ยาเม็ดคุมกำเนิดที่มีฮอร์โมนโปรเจสเตอโรนเพียงอย่างเดียว นักศึกษาจะให้คำแนะนำอย่างไร เกี่ยวกับการใช้ยาเม็ดคุมกำเนิด ผลข้างเคียงที่อาจจะเกิดขึ้น และวิธีการแก้ไขปัญหาอย่างเหมาะสม กรณีที่ลืมรับประทานยาเม็ดคุมกำเนิด
เฉลย
•	ยาคุมกำเนิดชนิดเดี่ยว (minipills/ progesterone only pills) มีความเหมาะสมกับมารดาหลังคลอดที่เลี้ยงบุตรด้วยนม เพราะจะไม่ทำให้น้ำนมแห้ง  (20 คะแนน)
•	ยาคุมประเภทนี้จะช่วยทำให้มูกที่ปากมดลูกเหนียวข้น ทำให้สเปิร์มเคลื่อนเข้าไปยาก (15 คะแนน)
•	ในแผงยาจะมีจำนวน 28 เม็ด ไม่มียาหลอกหรือแป้ง มารดาควรรับประทานทุกวัน ไม่หยุด ควรรับประทานให้ตรงเวลาเพื่อให้ระดับฮอร์โมนอยู่ในระดับสูงสม่ำเสมอ หากทานไม่ตรงเวลา จะส่งผลถึงประสิทธิภาพลดลงได้ (20 คะแนน)
•	กรณีลืม 1 วัน รีบทานทันทีที่นึกได้ แต่หากลืมสองวัน ให้ทานเม็ดที่ลืมในตอนเช้าที่นึกได้ คืนนั้นทานเม็ดที่ต้องทานประจำ และเช้าอีกวัน ทานเม็ดที่ลืมเม็ดที่สอง คืนนั้นทานเม็ดที่ต้องทานตามปกติ แต่หากลืมเกิน 3 วัน ขอให้ทิ้งแผงนี้ไป และรอประจำเดือนมา ค่อยเริ่มแผงใหม่ (20 คะแนน)
•	ให้สตรีสังเกตอาการข้างเคียง เช่น ประจำเดือนมาไม่สม่ำเสมอ หรือมีเลือดออกผิดปกติ เต้านมคัดตึง อารมณ์เปลี่ยนแปลง (10 คะแนน)

คะแนนเต็มเท่ากับ 100 คะแนน
`;

    const checkContent = `
นี่คือคำตอบของนักศึกษา: "${transcription}".
ที่คือเฉลย: "${answerKey}".

โปรดเปรียบเทียบคำตอบของนักศึกษากับเฉลยและให้คะแนน พร้อมทั้งอธิบายรายละเอียดสิ่งที่นักศึกษาทำได้ดีอย่างละเอียดและข้อเสนอแนะพร้อมบอกคะแนนแต่ละส่วน ตอบเป็นภาษาไทย
ไม่ต้องติในเรื่องไวยกรณ์หรือเรื่องที่ไม่เกี่ยวข้อง
โปรดแปลงผลการประเมินเป็น JSON รูปแบบดังนี้เท่านั้น:
    {
      "totalScore": <คะแนนนักศึกษาได้>,
      "pros": "<สิ่งที่นักศึกษาทำได้ดี>",
      "recommendations": "<ข้อปรับปรุงพร้อมบอกคะแนนแต่ละส่วน>"
    }
`;

    const response = await openai.chat.completions.create({
        messages: [{ role: "system", content: checkContent }],
        model: "gpt-4o",
        response_format: { "type": "json_object" }
    });

    const feedbackJson = JSON.parse(response.choices[0].message.content.trim());
    console.log(feedbackJson);
    return feedbackJson;
}

// Dummy endpoint to simulate GPT API response
router.post('/dummy-gpt-response', async (req, res) => {
    const dummyFeedbackJson = {
        totalScore: 99,
        pros: 'นักศึกษามีความพยายามในการอธิบายขั้นตอนการนำลูกเข้าเต้าได้ดีพอควร รวมถึงการระบุถึงรายละเอียดเช่นตำแหน่งของหัวนมและศีรษะของทารก',
        recommendations: 'นักศึกษาควรเพิ่มการซักประวัติจากมารดารวมถึงจากบุตรให้ครบถ้วนตามที่เฉลยกำหนด เช่น ปริมาณน้ำที่มารดาดื่ม จำนวนครั้งของการปัสสาวะและอุจจาระของบุตร น้ำหนักบุตร เป็นต้น นอกจากนี้ควรขยายข้อมูลการวินิจฉัยทางการพยาบาลและเพิ่มเติมคำแนะนำอย่างละเอียด เช่นเดียวกับการสาธิตท่าอุ้มและการบรรเทาอาการเจ็บที่หัวนมให้ครบถ้วน'
    };
    res.json(dummyFeedbackJson);
});

// Handle file upload and processing (Modified for dummy data testing)
router.post('/dummy', authMiddleware, async (req, res) => {
    const dummyTranscription = 'นี่จะเป็นวิธีการสาธินำลูกเข้าเต้า โดยวัจการประคองศีรษะของธรุป ในรูปแบบของทุกวอนโฮเตอร์ แล้วก็ นำลูกเข้าเต่าโดยที่ให้สหัวของสารกงศีรษะเงียนขึ้น โดยใช้มือข้างหนึ่งนะครับ จับเท้าไว้แล้วก็นำ ติดปากของทารกและเอาหัวนมมาให้ใกล้กันอย่างนี้นะครับ และให้ทำการเอานมเข้าปากทะเลาะโดยให้ทะเลาะอมทั้งหมด นมและอมจนถึงร้านนมนะครับ เพื่อป้องกันการเจ็บที่บริเวณหัวนม เพื่อการเหงียนขึ้น เราจะไม่นำลูก เข้าแบบอย่างนี้นะครับเราจะนั่งลูกใหญ่ขึ้นนิดนึงนะครับแล้วก็เข้าเต้าในเนรนาดแบบนี้ครับ อุ้ย';

    try {
        const feedbackResponse = await axios.post('http://localhost:3000/api/v1/lab/dummy-gpt-response');
        const feedbackJson = feedbackResponse.data;

        const labInfo = {
            studentId: req.userId, // Make sure this is a valid ObjectId in your test data
            labNumber: 2,
            subject: 'maternalandchild',
            videoPath: 'dummy-path/compressed-video.mp4', // Use a dummy path
            studentAnswer: dummyTranscription,
            studentScore: feedbackJson.totalScore,
            isPass: feedbackJson.totalScore >= 50,
            pros: feedbackJson.pros,
            recommendations: feedbackJson.recommendations,
        };

        await axios.post('http://localhost:3000/api/v1/lab/submit-lab', labInfo);

        res.json({
            feedback: feedbackJson,
            transcription: dummyTranscription,
            passFailStatus: feedbackJson.totalScore >= 50 ? 'Passed' : 'Failed',
            score: feedbackJson.totalScore,
            pros: feedbackJson.pros,
            recommendations: feedbackJson.recommendations
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ msg: 'Error processing the dummy data' });
    }
});

module.exports = router;
