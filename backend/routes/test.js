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
const { S3Client  } = require("@aws-sdk/client-s3");
const { createPresignedPost } = require("@aws-sdk/s3-presigned-post");
const { Upload } = require("@aws-sdk/lib-storage");

const { User, LabSubmission, LabInfo } = require('../db');
const { authMiddleware, fileSizeErrorHandler } = require('../middleware');

require('dotenv').config();

const s3Client = new S3Client({
    endpoint: `https://${process.env.DO_SPACES_ENDPOINT}`,
    region: process.env.DO_SPACES_REGION,
    credentials: {
        accessKeyId: process.env.DO_SPACES_KEY,
        secretAccessKey: process.env.DO_SPACES_SECRET
    },
    forcePathStyle: false
});

// Function to upload file to DigitalOcean Spaces
async function uploadToSpaces(filePath, fileName) {
    const fileStream = fs.createReadStream(filePath);

    const params = {
        Bucket: process.env.DO_SPACES_BUCKET,
        Key: fileName,  // This should not include the bucket name
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
        
        // Construct the correct URL
        const cdnUrl = `https://${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_CDN_ENDPOINT}/${fileName}`;
        return cdnUrl;
    } catch (err) {
        console.error("Error uploading to DigitalOcean Spaces:", err);
        throw err;
    }
}

const OpenAI = require('openai');

// Set up ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

router.get('/get-upload-url', authMiddleware, async (req, res) => {
    const fileName = `lab1/${req.userId}/${Date.now()}${req.query.fileExtension}`;
    
    const params = {
      Bucket: process.env.DO_SPACES_BUCKET,
      Key: fileName,
      Expires: 60 * 10, // URL expires in 10 minutes
      Conditions: [
        ['content-length-range', 0, 943718400], // 900MB max file size
        {'Content-Type': req.query.contentType}
      ]
    };
  
    try {
      const { url, fields } = await createPresignedPost(s3Client, params);
      console.log('Pre-signed POST data:', { url, fields });  // Add this line
      res.json({ url, fields });
    } catch (error) {
      console.error('Error generating pre-signed POST policy:', error);
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
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
    limits: { fileSize: 800000000 }, // 800MB file size limit
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
    const fileNameWithoutExt = path.basename(filePath, path.extname(filePath));

    // Extract audio if the file is MP4 or MOV
    if (['.mp4', '.mov'].includes(path.extname(filePath).toLowerCase())) {
        audioPath = `./public/uploads/audio-${fileNameWithoutExt}.mp3`;

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

    return { transcription: transcriptionText, audioPath: audioPath };
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
router.post('/upload', authMiddleware, (req, res) => {
    console.time('Total processing time');
    console.log('Starting file upload process');
    upload(req, res, async (err) => {
        if (err) {
            console.log('File upload error:', err);
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ msg: 'File is too large', errorCode: 'FILE_TOO_LARGE' });
            }
            return res.status(400).json({ msg: err.message });
        }

        console.log('File uploaded successfully');
        const uploadTimestamp = Date.now();
        const filePath = `./public/uploads/${req.file.filename}`;
        let audioPath = null;
        let videoUrl = null;

        try {
            console.time('Audio extraction');
            console.log('Starting audio extraction');
            audioPath = `./public/uploads/audio-${uploadTimestamp}.mp3`;
            await new Promise((resolve, reject) => {
                ffmpeg(filePath)
                    .output(audioPath)
                    .audioCodec('libmp3lame')
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });
            console.timeEnd('Audio extraction');

            console.log('Starting parallel processes: upload to Spaces and transcribe audio');
            console.time('Parallel processes');
            const [spacesUploadPromise, transcriptionPromise] = await Promise.all([
                (async () => {
                    console.time('Spaces upload');
                    const spacesFileName = `lab1/${req.userId}/${uploadTimestamp}${path.extname(req.file.filename)}`;
                    const result = await uploadToSpaces(filePath, spacesFileName);
                    console.timeEnd('Spaces upload');
                    return result;
                })(),
                (async () => {
                    console.time('Audio transcription');
                    const result = await transcribeAudioIApp(audioPath);
                    console.timeEnd('Audio transcription');
                    return result;
                })()
            ]);

            videoUrl = await spacesUploadPromise;
            const transcriptionResult = await transcriptionPromise;
            console.timeEnd('Parallel processes');

            console.log('Concatenating transcription text');
            const transcription = concatenateTranscriptionText(transcriptionResult.output);

            console.time('GPT processing');
            console.log('Processing transcription with GPT API');
            const feedbackJson = await processTranscriptionLab1(transcription);
            console.timeEnd('GPT processing');

            console.log('Preparing lab info');
            const labInfo = {
                studentId: req.userId,
                labNumber: 1,
                subject: 'maternalandchild',
                videoPath: videoUrl,
                studentAnswer: transcription,
                studentScore: feedbackJson.totalScore,
                isPass: feedbackJson.totalScore >= 60,
                pros: feedbackJson.pros,
                recommendations: feedbackJson.recommendations,
            };

            console.time('Lab submission');
            console.log('Storing lab submission');
            await axios.post('http://localhost:3000/api/v1/lab/submit-lab', labInfo);
            console.timeEnd('Lab submission');

            console.log('Sending response to frontend');
            res.json({
                feedback: feedbackJson,
                transcription,
                passFailStatus: feedbackJson.totalScore >= 60 ? 'Passed' : 'Failed',
                score: feedbackJson.totalScore,
                pros: feedbackJson.pros,
                recommendations: feedbackJson.recommendations,
                videoUrl: videoUrl
            });

        } catch (error) {
            console.error('Error processing the file:', error);
            res.status(500).json({ msg: 'Error processing the file', error: error.message });
        } finally {
            console.log('Cleaning up local files');
            const filesToDelete = [filePath, audioPath].filter(Boolean);
        
            filesToDelete.forEach(path => {
                if (fs.existsSync(path)) {
                    try {
                        fs.unlinkSync(path);
                        console.log(`Successfully deleted: ${path}`);
                    } catch (deleteError) {
                        console.error(`Failed to delete file: ${path}`, deleteError);
                    }
                } else {
                    console.log(`File not found or already deleted: ${path}`);
                }
            });
        }
        console.timeEnd('Total processing time');
    });
});
router.post('/process', authMiddleware, async (req, res) => {
    console.time('Total processing time');
    console.log('Starting file processing');
    const { fileName } = req.body;
    let audioPath = null;
    let videoUrl = null;

    try {
        // Download the file from DigitalOcean Spaces
        console.time('File download');
        const fileData = await s3Client.getObject({
            Bucket: process.env.DO_SPACES_BUCKET,
            Key: fileName
        }).promise();
        console.timeEnd('File download');

        const uploadTimestamp = Date.now();
        const filePath = `./public/temp/${uploadTimestamp}${path.extname(fileName)}`;
        
        // Write the file to a temporary location
        await fs.promises.writeFile(filePath, fileData.Body);

        console.time('Audio extraction');
        console.log('Starting audio extraction');
        audioPath = `./public/temp/audio-${uploadTimestamp}.mp3`;
        await new Promise((resolve, reject) => {
            ffmpeg(filePath)
                .output(audioPath)
                .audioCodec('libmp3lame')
                .on('end', resolve)
                .on('error', reject)
                .run();
        });
        console.timeEnd('Audio extraction');

        console.log('Starting audio transcription');
        console.time('Audio transcription');
        const transcriptionResult = await transcribeAudioIApp(audioPath);
        console.timeEnd('Audio transcription');

        console.log('Concatenating transcription text');
        const transcription = concatenateTranscriptionText(transcriptionResult.output);

        console.time('GPT processing');
        console.log('Processing transcription with GPT API');
        const feedbackJson = await processTranscriptionLab1(transcription);
        console.timeEnd('GPT processing');

        console.log('Preparing lab info');
        const labInfo = {
            studentId: req.userId,
            labNumber: 1,
            subject: 'maternalandchild',
            videoPath: `https://${process.env.DO_SPACES_BUCKET}.${process.env.DO_SPACES_CDN_ENDPOINT}/${fileName}`,
            studentAnswer: transcription,
            studentScore: feedbackJson.totalScore,
            isPass: feedbackJson.totalScore >= 60,
            pros: feedbackJson.pros,
            recommendations: feedbackJson.recommendations,
        };

        console.time('Lab submission');
        console.log('Storing lab submission');
        await axios.post('http://localhost:3000/api/v1/lab/submit-lab', labInfo);
        console.timeEnd('Lab submission');

        console.log('Sending response to frontend');
        res.json({
            feedback: feedbackJson,
            transcription,
            passFailStatus: feedbackJson.totalScore >= 60 ? 'Passed' : 'Failed',
            score: feedbackJson.totalScore,
            pros: feedbackJson.pros,
            recommendations: feedbackJson.recommendations,
            videoUrl: labInfo.videoPath
        });

    } catch (error) {
        console.error('Error processing the file:', error);
        res.status(500).json({ msg: 'Error processing the file', error: error.message });
    } finally {
        console.log('Cleaning up temporary files');
        const filesToDelete = [filePath, audioPath].filter(Boolean);
    
        filesToDelete.forEach(path => {
            if (fs.existsSync(path)) {
                try {
                    fs.unlinkSync(path);
                    console.log(`Successfully deleted: ${path}`);
                } catch (deleteError) {
                    console.error(`Failed to delete file: ${path}`, deleteError);
                }
            } else {
                console.log(`File not found or already deleted: ${path}`);
            }
        });
    }
    console.timeEnd('Total processing time');
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