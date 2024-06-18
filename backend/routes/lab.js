const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const FormData = require('form-data');
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
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb('Error: MP4, MOV, or MP3 Files Only!');
    }
}

// Handle file upload and processing
router.post('/upload', (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ msg: err });
        } 
        if (!req.file) {
            return res.status(400).json({ msg: 'No file selected!' });
        }

        const filePath = `./public/uploads/${req.file.filename}`;

        try {
            // Compress the video file
            const compressedFilePath = `./public/uploads/compressed-${req.file.filename}`;
            await compressVideo(filePath, compressedFilePath);

            // Process the compressed video file
            const { transcription, feedback } = await processFile(compressedFilePath);

            // Delete the uploaded  video after processing
            fs.unlinkSync(filePath);

            // Return the feedback and transcription
            res.json({ feedback, transcription });
        } catch (error) {
            console.error(error);
            res.status(500).json({ msg: 'Error processing the file' });
        }
    });
});

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

    // Transcribe the audio file using OpenAI Whisper API
    const transcription = await transcribeAudio(audioPath);
    console.log(transcription);

    // Compare transcription with answer key using GPT-4 API
    const feedback = await processTranscription(transcription.text);
    console.log(feedback);
    return { transcription: transcription.text, feedback };
}

async function transcribeAudio(audioPath) {
    const form = new FormData();
    form.append('file', fs.createReadStream(audioPath));
    form.append('model', 'whisper-1');
    form.append('language', 'th');

    const response = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
        headers: {
            ...form.getHeaders(),
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        }
    });

    return response.data;
}

async function processTranscription(transcription) {
    const answerKey = `
ประวัติเพิ่มเติมจากมารดา:
- ปริมาณน้ำที่มารดาได้ดื่มในช่วงวันที่ผ่านมา
- จำนวนครั้งของการนำบุตรเข้าเต้ากี่ครั้ง/วัน
- ระยะเวลาที่มารดานำบุตรเข้าเต้าแต่ละครั้งนานเท่าใด
- เข้าเต้าทั้งสองข้างหรือไม่
- ขณะบุตรดูดนม ให้บุตรอมลึกถึงลานนมหรือไม่
- ระดับการเจ็บที่หัวนม ระบุ 0-10
- อาจร้องขอให้มารดาอุ้มบุตรเข้าเต้าให้ดู

ประวัติเพิ่มเติมจากบุตร:
- สีของปัสสาวะบุตร
- จำนวนครั้งของการปัสสาวะและอุจจาระ
- การพักหลับของบุตร
- ได้ชั่งน้ำหนักบุตรหรือไม่
- น้ำหนักตัวบุตรลดลงหรือไม่ และลดลงเท่าใด

ข้อวินิจฉัยทางการพยาบาล:
- พร่องความรู้และทักษะในการเลี้ยงบุตรด้วยนมมารดา เนื่องจากมารดาไม่มีประสบการณ์หรือมารดาตั้งครรภ์ในวัยรุ่น
- บุตรมีโอกาสได้รับสารอาหารไม่เพียงพอ

คำแนะนำแก่คุณแม่:
- อธิบายการดูดอย่างถูกวิธี โดยเน้นการอุ้มบุตรกระชับแนบลำตัวมารดา ท้องมารดาชิดท้องบุตร หน้าบุตรเงยเล็กน้อย ลำตัวบุตรอยู่ในแนวตรง บุตรอมลึกถึงลานนม
- อธิบายรายละเอียดของการดูดบ่อย เช่น ดูดทุก 2-3 ชั่วโมง หรือดูดเมื่อบุตรต้องการ ดูดแต่ละครั้งนาน 20 นาที
- ให้นำบุตรดูดนมข้างที่เจ็บน้อยกว่าก่อน ในรายนี้เริ่มจากดูดข้างซ้าย หากบุตรไม่อิ่มให้ดูดต่อที่ด้านขวา มื้อต่อไปให้ลูกดูดจากเต้าด้านขวาที่ดูดค้างไว้
- หลังจากดูดนม แนะนำให้มารดานำน้ำนมทาบริเวณหัวนม
- เมื่อลูกอิ่ม ลูกจะคายหัวนมออก หากลูกยังดูดนมอยู่ อย่าดึงหัวนมออกจะทำให้หัวนมแตก ถ้าแม่ต้องการเอานมออกจากปากลูก ให้กดคางหรือใช้นิ้วก้อยสอดเข้าไปในปากลูกเพื่อให้ลูกอ้าปาก แล้วคายหัวนมออก
- ลักษณะการกลืนอย่างถูกวิธี เช่น สังเกตการกลืนอย่างเป็นจังหวะ ไม่มีเสียงดูด ได้แต่เสียงลม (เสียงจ๊วบ จ๊วบ)
- อธิบายการสังเกตความเพียงพอของน้ำนม เช่น การพักหลับของบุตร จำนวนครั้งของปัสสาวะอุจจาระของบุตร สีของปัสสาวะ เป็นต้น หรือแนะนำหลักการ 4 6 8
- แนะนำการเพิ่มปริมาณน้ำนมโดยการประคบร้อนก่อนให้บุตรดูด/เข้าเต้า
- แนะนำการดื่มน้ำอุ่นบ่อยครั้ง
- อธิบายประโยชน์ของนมมารดาต่อมารดาและบุตร
- แนะนำอาหารประเภทเรียกน้ำนม เช่น ขิง กระเพรา ใบแมงลัก นมถั่วเหลือง เป็นต้น

การสาธิตท่าอุ้มและการบรรเทา/ป้องกันการเจ็บหัวนม:
- สาธิตการอุ้มบุตรเข้าเต้าอย่างถูกต้อง ขณะนำลูกเข้าเต้า ลูกจะมีลำตัวตรง คอไม่บิด ท้องลูกแนบชิดกับท้องแม่ ลูกหันหน้าเข้าหาเต้านมแม่ มือแม่รองรับลำตัวลูกไว้ หากลูกดูดได้ถูกต้อง แม่จะไม่เจ็บหัวนม หัวนมไม่แตก จังหวะการดูดของลูกสม่ำเสมอ
- ท่าอุ้มขวางตัก (cradle hold): ลูกนอนขวางบนตัก ตะแคงเข้าหาตัวแม่ ท้องลูกแนบชิดท้องแม่ ใช้แขนพาดด้านหลังของลูก ฝ่ามือจับช้อนบริเวณก้นและต้นขา ปากลูกอยู่ตรงหัวนมพอดี ศีรษะและลำตัวลูกอยู่ในแนวตรง ศีรษะสูงกว่าลำตัวเล็กน้อย
- ท่าอุ้มขวางตักประยุกต์ (modified cradle hold): เปลี่ยนมือจากท่าอุ้มขวางตัก ใช้มือข้างเดียวกับที่ลูกดูดประคองเต้านม มืออีกข้างรองรับต้นคอและท้ายทอยลูก
- ท่าฟุตบอล (football hold): จับลูกกึ่งตะแคงกึ่งนอนหงาย มือจับที่ต้นคอและท้ายทอยลูก กอดตัวลูกกระชับกับสีข้างแม่ ให้ขาของลูกชี้ไปทางด้านหลังของแม่ ลูกดูดนมจากเต้านมข้างเดียวกับฝ่ามือที่ถูกจับ
- ท่านอน (side lying): แม่ลูกนอนตะแคงเข้าหากัน แม่นอนศีรษะสูง หลังและสะโพกตรงให้มากที่สุด ให้ปากลูกอยู่ตรงกับหัวนมแม่ มือที่อยู่ด้านล่างประคองหลังลูก มือที่อยู่ด้านบนประคองเต้านมในช่วงแรกที่เริ่มเอาหัวนมเข้าปาก
- วิธีบรรเทาอาการเจ็บหัวนม: สามารถทำได้โดยบีบน้ำนมเพื่อทาบริเวณหัวนมและลานนม
`;

    const checkContent = `
นี่คือคำตอบของนักศึกษา: "${transcription}".
ที่คือเฉลย: "${answerKey}".
เกณฑ์การประเมิน การซักประวัติจากมารดา: 10%
การซักประวัติจากบุตร: 10%
การวินิจฉัยทางการพยาบาล: 10%
การให้คำแนะนำ: 40%
การสาธิตท่าอุ้มและการบรรเทาอาการ: 30%

can you compare key answer and evaluate the score of one nursing student please provide detail, comparing the key answer and her answer
ตอบเป็นภาษาไทย
`;

    const response = await openai.chat.completions.create({
        messages: [{ role: "system", content: checkContent }],
        model: "gpt-3.5-turbo",
    });

    console.log(response);
    return response.choices[0].message.content.trim();
}

module.exports = router;
