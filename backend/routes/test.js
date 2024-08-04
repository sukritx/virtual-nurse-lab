const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { Upload } = require("@aws-sdk/lib-storage");
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const FormData = require('form-data');
const OpenAI = require('openai');
const { LabSubmission, LabInfo } = require('../db');
const { authMiddleware } = require('../middleware');

require('dotenv').config();

// Set up S3 client (DigitalOcean Spaces)
const s3Client = new S3Client({
    endpoint: `https://${process.env.DO_SPACES_ENDPOINT}`,
    region: process.env.DO_SPACES_REGION,
    credentials: {
        accessKeyId: process.env.DO_SPACES_KEY,
        secretAccessKey: process.env.DO_SPACES_SECRET
    },
    forcePathStyle: false
});

// Set up OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Generate pre-signed URL for direct upload
router.get('/get-upload-url', authMiddleware, async (req, res) => {
    const uploadTimestamp = Date.now();
    const fileExtension = req.query.fileExtension || '.mp4'; // Default to .mp4 if not provided
    const spacesFileName = `lab1/${req.userId}/${uploadTimestamp}${fileExtension}`;

    const params = {
        Bucket: process.env.DO_SPACES_BUCKET,
        Key: spacesFileName,
        ContentType: 'video/mp4',
        ACL: 'public-read'
    };

    try {
        const command = new PutObjectCommand(params);
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        res.json({ 
            uploadUrl: signedUrl, 
            fileName: spacesFileName,
            fileUrl: `https://${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_CDN_ENDPOINT}/${spacesFileName}`
        });
    } catch (error) {
        console.error('Error generating signed URL:', error);
        res.status(500).json({ error: 'Failed to generate upload URL' });
    }
});

// Function to upload file to DigitalOcean Spaces
async function uploadToSpaces(filePath, fileName) {
    const fileStream = fs.createReadStream(filePath);

    const params = {
        Bucket: process.env.DO_SPACES_BUCKET,
        Key: fileName,
        Body: fileStream,
        ACL: 'public-read'
    };

    try {
        const upload = new Upload({
            client: s3Client,
            params: params
        });

        const result = await upload.done();
        console.log("Upload successful:", result);
        
        const cdnUrl = `https://${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_CDN_ENDPOINT}/${fileName}`;
        return cdnUrl;
    } catch (err) {
        console.error("Error uploading to DigitalOcean Spaces:", err);
        throw err;
    }
}

// Function to download file from DigitalOcean Spaces
async function downloadFromSpaces(fileName) {
    const params = {
        Bucket: process.env.DO_SPACES_BUCKET,
        Key: fileName,
    };

    try {
        const command = new GetObjectCommand(params);
        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        const response = await axios.get(signedUrl, { responseType: 'arraybuffer' });
        return Buffer.from(response.data);
    } catch (err) {
        console.error("Error downloading from DigitalOcean Spaces:", err);
        throw err;
    }
}

// Function to extract audio from video
async function extractAudio(videoBuffer) {
    return new Promise((resolve, reject) => {
        const audioStream = new require('stream').PassThrough();
        ffmpeg(videoBuffer)
            .toFormat('mp3')
            .on('error', reject)
            .on('end', () => {
                resolve(audioStream.read());
            })
            .pipe(audioStream);
    });
}

async function transcribeAudio(audioBuffer) {
    let data = new FormData();
    data.append('file', audioBuffer, { filename: 'audio.mp3', contentType: 'audio/mp3' });

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
        return response.data.output.map(segment => segment.text).join(' ');
    } catch (error) {
        console.error('Transcription error:', error);
        throw error;
    }
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

router.post('/upload', authMiddleware, async (req, res) => {
    try {
        // Download the file from Spaces
        const videoBuffer = await downloadFromSpaces(fileName);

        // Extract audio
        const audioBuffer = await extractAudio(videoBuffer);

        // Get transcription
        const transcription = await transcribeAudio(audioBuffer);

        // Process with ChatGPT
        const gptResult = await processTranscriptionLab1(transcription);

        // Store in MongoDB
        const labInfo = {
            studentId: req.userId,
            labNumber: 1,
            subject: 'maternalandchild',
            videoPath: videoUrl,
            studentAnswer: transcription,
            studentScore: gptResult.totalScore,
            isPass: gptResult.totalScore >= 60,
            pros: gptResult.pros,
            recommendations: gptResult.recommendations,
        };

        console.time('Lab submission');
        console.log('Storing lab submission');
        await axios.post('http://localhost:3000/api/v1/test/submit-lab', labInfo);

        // Send results to frontend
        res.json({
            feedback: gptResult.feedback,
            transcription,
            passFailStatus: gptResult.totalScore >= 60 ? 'Passed' : 'Failed',
            score: gptResult.totalScore,
            pros: gptResult.pros,
            recommendations: gptResult.recommendations,
            videoUrl
        });

    } catch (error) {
        console.error('Error processing upload:', error);
        res.status(500).json({ error: 'An error occurred during processing' });
    } finally {
        // Clean up temporary files
        if (req.file) fs.unlinkSync(req.file.path);
        if (fs.existsSync(`${req.file.path}.mp3`)) fs.unlinkSync(`${req.file.path}.mp3`);
    }
});
async function processTranscriptionLab1(transcription) {
    const answerKey = `
Lab 1: การเลี้ยงลูกด้วยนมแม่ กรณีมารดาเจ็บหัวนม
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

โปรดเปรียบเทียบคำตอบของนักศึกษากับเฉลย ตรงประเด็นหรือไม่ พร้อมทั้งอธิบายรายละเอียดสิ่งที่นักศึกษาทำได้ดีอย่างละเอียดและข้อเสนอแนะ โดยไม่ต้องชี้แจงคะแนนย่อย ตอบเป็นภาษาไทย
ไม่ต้องติในเรื่องไวยกรณ์หรือเรื่องที่ไม่เกี่ยวข้อง
โปรดแปลงผลการประเมินเป็น JSON รูปแบบดังนี้เท่านั้น:
    {
      "totalScore": <คะแนนนักศึกษาได้>,
      "pros": "<จุดที่นักศึกษาทำได้ดี>",
      "recommendations": "<ข้อเสนอแนะ>"
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

module.exports = router;