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
const { S3Client } = require("@aws-sdk/client-s3");
const { createPresignedPost } = require("@aws-sdk/s3-presigned-post");
const { Upload } = require("@aws-sdk/lib-storage");
const OpenAI = require('openai');

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

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

function getFileType(fileName) {
    // Remove codec information if present
    const cleanFileName = fileName.split(';')[0];
    const ext = path.extname(cleanFileName).toLowerCase();
    if (['.mp4', '.avi', '.mov', '.webm'].includes(ext)) return 'video';
    if (['.mp3', '.m4a', '.wav'].includes(ext)) return 'audio';
    throw new Error('Unsupported file type');
}

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

async function transcribeAudioOpenAI(audioPath) {
    try {
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: "whisper-1",
            response_format: "text",
        });

        return transcription;
    } catch (error) {
        console.error('Error transcribing audio with OpenAI:', error);
        throw new Error(`Transcription failed: ${error.message}`);
    }
}

function concatenateTranscriptionText(transcriptionOutput) {
    return transcriptionOutput.map(segment => segment.text).join(' ');
}

// Store student's lab data into the database
router.post('/submit-lab', async (req, res) => {
    const { studentId, labNumber, subject, fileUrl, fileType, studentAnswer, studentScore, isPass, pros, recommendations } = req.body;

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
            fileUrl,
            fileType,
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

const upload = multer({ dest: 'uploads/' });

router.post('/upload-chunk', authMiddleware, upload.single('chunk'), async (req, res) => {
    const { chunkIndex, totalChunks } = req.body;
    const chunk = req.file;

    if (!chunk) {
        return res.status(400).json({ error: 'No chunk uploaded' });
    }

    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir);
    }

    const tempFilePath = path.join(tempDir, `${req.userId}_${chunkIndex}`);

    fs.renameSync(chunk.path, tempFilePath);

    res.json({ message: 'Chunk uploaded successfully' });
});

router.post('/upload-test', authMiddleware, async (req, res) => {
    const { fileName, totalChunks } = req.body;
    const tempDir = path.join(__dirname, '../temp');
    const finalFilePath = path.join(__dirname, '../public/uploads', fileName);
    let audioPath = null;
    let fileUrl = null;
    let fileType = null;

    try {
        // Reassemble the file from chunks
        await new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(finalFilePath);
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);

            (async () => {
                for (let i = 0; i < totalChunks; i++) {
                    const chunkPath = path.join(tempDir, `${req.userId}_${i}`);
                    const chunkBuffer = await fs.promises.readFile(chunkPath);
                    writeStream.write(chunkBuffer);
                    await fs.promises.unlink(chunkPath);
                }
                writeStream.end();
            })();
        });

        // console.log('File reassembled successfully');
        const uploadTimestamp = Date.now();

        fileType = getFileType(fileName);

        // Upload the original file to Spaces
        // console.time('Spaces upload');
        fileUrl = await uploadToSpaces(finalFilePath, `lab1/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
        // console.timeEnd('Spaces upload');

        if (fileType === 'video') {
            // Audio extraction for transcription
            // console.time('Audio extraction');
            audioPath = `./public/uploads/audio-${uploadTimestamp}.mp3`;
            await new Promise((resolve, reject) => {
                ffmpeg(finalFilePath)
                    .output(audioPath)
                    .audioCodec('libmp3lame')
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });
            // console.timeEnd('Audio extraction');
        } else {
            // For audio files, use the uploaded file directly
            audioPath = finalFilePath;
        }

        // Transcription
        // console.time('Transcription');
        const transcription = await transcribeAudioOpenAI(audioPath);
        // console.timeEnd('Transcription');

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab1(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 1,
            subject: 'maternalandchild',
            fileUrl: fileUrl,
            fileType: fileType,
            studentAnswer: transcription,
            studentScore: feedbackJson.totalScore,
            isPass: feedbackJson.totalScore >= 60,
            pros: feedbackJson.pros,
            recommendations: feedbackJson.recommendations,
        };

        // console.time('Lab submission');
        await axios.post('http://localhost:3000/api/v1/lab-deployed/submit-lab', labInfo);
        // console.timeEnd('Lab submission');

        // Send response
        res.json({
            feedback: feedbackJson,
            transcription,
            passFailStatus: feedbackJson.totalScore >= 60 ? 'Passed' : 'Failed',
            score: feedbackJson.totalScore,
            pros: feedbackJson.pros,
            recommendations: feedbackJson.recommendations,
            fileUrl: fileUrl,
            fileType: fileType
        });

    } catch (error) {
        console.error('Error processing the file:', error);
        res.status(500).json({ msg: 'Error processing the file', error: error.message });
    } finally {
        // Cleanup
        // console.log('Cleaning up local files');
        [finalFilePath, audioPath].forEach(path => {
            if (path && fs.existsSync(path)) {
                try {
                    fs.unlinkSync(path);
                    // console.log(`Successfully deleted: ${path}`);
                } catch (deleteError) {
                    if (deleteError.code !== 'ENOENT') {
                        console.error(`Failed to delete file: ${path}`, deleteError);
                    }
                }
            }
        });
    }
});

/*router.post('/upload-1', authMiddleware, async (req, res) => {
    const { fileName, totalChunks } = req.body;
    const tempDir = path.join(__dirname, '../temp');
    const finalFilePath = path.join(__dirname, '../public/uploads', fileName);
    let audioPath = null;
    let fileUrl = null;
    let fileType = null;

    try {
        // Reassemble the file from chunks
        await new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(finalFilePath);
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);

            (async () => {
                for (let i = 0; i < totalChunks; i++) {
                    const chunkPath = path.join(tempDir, `${req.userId}_${i}`);
                    const chunkBuffer = await fs.promises.readFile(chunkPath);
                    writeStream.write(chunkBuffer);
                    await fs.promises.unlink(chunkPath);
                }
                writeStream.end();
            })();
        });

        console.log('File reassembled successfully');
        const uploadTimestamp = Date.now();

        fileType = getFileType(fileName);

        // Upload the original file to Spaces
        console.time('Spaces upload');
        fileUrl = await uploadToSpaces(finalFilePath, `lab1/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
        console.timeEnd('Spaces upload');

        if (fileType === 'video') {
            // Audio extraction for transcription
            console.time('Audio extraction');
            audioPath = `./public/uploads/audio-${uploadTimestamp}.mp3`;
            await new Promise((resolve, reject) => {
                ffmpeg(finalFilePath)
                    .output(audioPath)
                    .audioCodec('libmp3lame')
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });
            console.timeEnd('Audio extraction');
        } else {
            // For audio files, use the uploaded file directly
            audioPath = finalFilePath;
        }

        // Transcription
        console.time('Transcription');
        const transcriptionResult = await transcribeAudioIApp(audioPath);
        console.timeEnd('Transcription');

        const transcription = concatenateTranscriptionText(transcriptionResult.output);

        // GPT processing (same as before)
        console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab1(transcription);
        console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 1,
            subject: 'maternalandchild',
            fileUrl: fileUrl,
            fileType: fileType,
            studentAnswer: transcription,
            studentScore: feedbackJson.totalScore,
            isPass: feedbackJson.totalScore >= 60,
            pros: feedbackJson.pros,
            recommendations: feedbackJson.recommendations,
        };

        console.time('Lab submission');
        await axios.post('http://localhost:3000/api/v1/lab-deployed/submit-lab', labInfo);
        console.timeEnd('Lab submission');

        // Send response
        res.json({
            feedback: feedbackJson,
            transcription,
            passFailStatus: feedbackJson.totalScore >= 60 ? 'Passed' : 'Failed',
            score: feedbackJson.totalScore,
            pros: feedbackJson.pros,
            recommendations: feedbackJson.recommendations,
            fileUrl: fileUrl,
            fileType: fileType
        });

    } catch (error) {
        console.error('Error processing the file:', error);
        res.status(500).json({ msg: 'Error processing the file', error: error.message });
    } finally {
        // Cleanup
        console.log('Cleaning up local files');
        [finalFilePath, audioPath].forEach(path => {
            if (path && fs.existsSync(path)) {
                try {
                    fs.unlinkSync(path);
                    console.log(`Successfully deleted: ${path}`);
                } catch (deleteError) {
                    if (deleteError.code !== 'ENOENT') {
                        console.error(`Failed to delete file: ${path}`, deleteError);
                    }
                }
            }
        });
    }
});*/

/*
SURGICAL NURSING 
*/

router.post('/surgical/1', authMiddleware, async (req, res) => {
    const { fileName, totalChunks } = req.body;
    const tempDir = path.join(__dirname, '../temp');
    const finalFilePath = path.join(__dirname, '../public/uploads', fileName);
    let audioPath = null;
    let fileUrl = null;
    let fileType = null;

    try {
        // Reassemble the file from chunks
        await new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(finalFilePath);
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);

            (async () => {
                for (let i = 0; i < totalChunks; i++) {
                    const chunkPath = path.join(tempDir, `${req.userId}_${i}`);
                    const chunkBuffer = await fs.promises.readFile(chunkPath);
                    writeStream.write(chunkBuffer);
                    await fs.promises.unlink(chunkPath);
                }
                writeStream.end();
            })();
        });

        // console.log('File reassembled successfully');
        const uploadTimestamp = Date.now();

        fileType = getFileType(fileName);

        // Upload the original file to Spaces
        // console.time('Spaces upload');
        fileUrl = await uploadToSpaces(finalFilePath, `surgical-1/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
        // console.timeEnd('Spaces upload');

        if (fileType === 'video') {
            // Audio extraction for transcription
            // console.time('Audio extraction');
            audioPath = `./public/uploads/audio-${uploadTimestamp}.mp3`;
            await new Promise((resolve, reject) => {
                ffmpeg(finalFilePath)
                    .output(audioPath)
                    .audioCodec('libmp3lame')
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });
            // console.timeEnd('Audio extraction');
        } else {
            // For audio files, use the uploaded file directly
            audioPath = finalFilePath;
        }

        // Transcription IApp
        const transcriptionResult = await transcribeAudioIApp(audioPath);
        const transcription = concatenateTranscriptionText(transcriptionResult.output);
        // const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionSurgicalLab1(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 1,
            subject: 'surgical',
            fileUrl: fileUrl,
            fileType: fileType,
            studentAnswer: transcription,
            studentScore: feedbackJson.totalScore,
            isPass: feedbackJson.totalScore >= 60,
            pros: feedbackJson.pros,
            recommendations: feedbackJson.recommendations,
        };

        // console.time('Lab submission');
        await axios.post('http://localhost:3000/api/v1/lab-deployed/submit-lab', labInfo);
        // console.timeEnd('Lab submission');

        // Send response
        res.json({
            feedback: feedbackJson,
            transcription,
            passFailStatus: feedbackJson.totalScore >= 60 ? 'Passed' : 'Failed',
            score: feedbackJson.totalScore,
            pros: feedbackJson.pros,
            recommendations: feedbackJson.recommendations,
            fileUrl: fileUrl,
            fileType: fileType
        });

    } catch (error) {
        console.error('Error processing the file:', error);
        res.status(500).json({ msg: 'Error processing the file', error: error.message });
    } finally {
        // Cleanup
        // console.log('Cleaning up local files');
        [finalFilePath, audioPath].forEach(path => {
            if (path && fs.existsSync(path)) {
                try {
                    fs.unlinkSync(path);
                    // console.log(`Successfully deleted: ${path}`);
                } catch (deleteError) {
                    if (deleteError.code !== 'ENOENT') {
                        console.error(`Failed to delete file: ${path}`, deleteError);
                    }
                }
            }
        });
    }
});

async function processTranscriptionSurgicalLab1(transcription) {
    const answerKey = `
สถานการณ์:
ผู้ป่วยชายอายุ 25 ปี กระดูกต้นขาขวาหักแบบปิด (Closed Fx. Right femur) จากอุบัติเหตุรถมอเตอร์ไซค์ล้ม ขณะนี้ On skeletal traction with weight 7 kgs. วันนี้แพทย์มีแผนการรักษาให้เตรียมผ่าตัด ดังนี้ 
	NPO after midnight
	On 5% D/S/2 1000 cc. IV drip 80 cc./hr.
	Prep skin ขาขวา
	Void ก่อนไป OR
	Pre-medication
	- Diazepam (5 mg.) 1 tab oral hs.

คำถาม: ขอให้ท่านแนะนำการเตรียมร่างกาย ด้านจิตใจ ด้านกฎหมาย และ เอกสารที่เกี่ยวข้องก่อนการผ่าตัดแก่ผู้ป่วยรายนี้

คำตอบ คะแนนเต็ม 100 คะแนน
การเตรียมด้านร่างกาย ประกอบด้วย
- คุณจะต้องงดน้ำและอาหารทางปากทุกชนิดหลังเที่ยงคืนเป็นต้นไป (NPO หลังเที่ยงคืน) (10)
- คุณจะได้รับสารน้ำทางหลอดเลือดดำ (IV FLUID) ตอนเช้าของวันผ่าตัด (10)
- คุณจะได้รับการเตรียมผิวหนังบริเวณผ่าตัด/ขาขวา (10)
- คุณต้องทำความสะอาดร่างกายตั้งแต่ศีรษะจรดปลายเท้า (5) ในตอนเย็น/บ่ายวันก่อนผ่าตัดและเช้าก่อนเข้าห้องผ่าตัด โดยการอาบน้ำ (5) สระผม (5) ตัดเล็บให้สั้น (5)
- ก่อนเข้าห้องผ่าตัดต้องถ่ายปัสสาวะ/ฉี่ก่อน (10)
การเตรียมด้านจิตใจ ประกอบด้วย
- แนะนำลักษณะ สิ่งแวดล้อม บุคลากรที่ผู้ป่วยจะพบในห้องผ่าตัด (5)
- มีการถาม/ประเมินผู้ป่วยถึงความกลัว (5) ความวิตกกังวล (5) เกี่ยวกับการผ่าตัด การได้รับยาสลบ/ยาชาทางช่องไขสันหลัง/การบล็อคหลัง (spinal/epidural block) (5)
- อธิบายการจัดการความปวดหลังผ่าตัด เช่น จะได้รับยาแก้ปวดแบบฉีดในวันแรกหลังผ่าตัด ถ้าปวดให้ขอยาแก้ปวดได้ (10)
- ตอบคำถาม ข้อสงสัยของผู้ป่วย (5)
- ดูแลให้ผู้ป่วยทานยา diazepam ก่อนนอน (5)


3. การเตรียมด้านกฎหมาย และเอกสารที่เกี่ยวข้อง ประกอบด้วย
- อธิบายผลดี/ประโยชน์ของการผ่าตัด (10) เช่น กระดูกจะติดกันเร็วผู้ป่วยจะได้เดินเร็วขึ้น (5) ไม่ต้องนอน/อยู่กับเตียงนาน/ดึงถ่วงน้ำหนัก/ดึงขานาน (5)
- อธิบายภาวะแทรกซ้อนที่อาจเกิดขึ้นได้จากการผ่าตัด (5) จากการได้รับยาระงับความรู้สึก/ยาสลบ/ยาชา (5)  การเสียเลือด/ตกเลือด ปวด (5)
- ให้ผู้ป่วยเซ็นใบยินยอมรับการรักษาโดยการผ่าตัด (10) ยินยอมรับยาระงับความรู้สึก ยินยอมรับเลือดกรณีเสียมาก 
`;

    const checkContent = `
คุณคือผู้ตรวจประเมินผลการปฏิบัติงานของนักศึกษาพยาบาลที่มีประสบการณ์ โปรดประเมินคำตอบของนักศึกษาจาก 'คำตอบของท่านผู้ทดสอบ' เทียบกับ 'เฉลยและเกณฑ์การให้คะแนน' อย่างละเอียด

**หลักการประเมิน:**
1.  **การเปรียบเทียบ:** ให้เปรียบเทียบคำตอบของนักศึกษาโดยเน้นความหมายและเนื้อหาที่ถูกต้องและครบถ้วนตาม 'เฉลยและเกณฑ์การให้คะแนน' ไม่ใช่เพียงแค่คำศัพท์ที่ตรงกันทุกคำ
2.  **การให้คะแนน:** 'เฉลยและเกณฑ์การให้คะแนน' มีประเด็นย่อยพร้อมคะแนนกำกับในวงเล็บ (เช่น (10), (5)) ให้คุณระบุว่าแต่ละประเด็นในเฉลยนั้นมีอยู่ในคำตอบของนักศึกษาหรือไม่
    *   ถ้าประเด็นนั้นปรากฏและถูกต้องสมบูรณ์: ให้คะแนนเต็มสำหรับประเด็นนั้น
    *   ถ้าประเด็นนั้นปรากฏแต่ไม่สมบูรณ์หรือไม่ถูกต้องทั้งหมด: ให้พิจารณาให้คะแนนบางส่วนตามความเหมาะสม (เช่น อาจได้ครึ่งหนึ่งของคะแนนเต็มสำหรับประเด็นนั้น)
    *   ถ้าประเด็นนั้นไม่ปรากฏเลย: ไม่ให้คะแนนสำหรับประเด็นนั้น
3.  **การคำนวณคะแนนรวม:** คำนวณ 'totalScore' จากผลรวมของคะแนนที่ได้รับจากแต่ละประเด็นย่อยในเฉลย
4.  **ข้อดี (pros):** ระบุประเด็นสำคัญใน 'เฉลยและเกณฑ์การให้คะแนน' ที่นักศึกษาสามารถตอบได้ถูกต้อง ชัดเจน และครบถ้วน โดยอธิบายรายละเอียดว่าทำไมจึงถือว่าทำได้ดี
5.  **ข้อเสนอแนะ (recommendations):** ระบุประเด็นสำคัญใน 'เฉลยและเกณฑ์การให้คะแนน' ที่นักศึกษาตอบได้ไม่สมบูรณ์ คลาดเคลื่อน หรือขาดหายไป พร้อมให้คำแนะนำที่เฉพาะเจาะจงเพื่อปรับปรุงในครั้งต่อไป
6.  **ข้อควรทราบ:** ไม่ต้องวิจารณ์เรื่องไวยากรณ์ การสะกดคำ หรือประเด็นอื่นที่ไม่เกี่ยวข้องกับเนื้อหาทางการพยาบาล


นี่คือคำตอบของท่านผู้ทดสอบ: "${transcription}".
ที่คือเฉลย: "${answerKey}".

**รูปแบบผลลัพธ์:**
โปรดสร้างผลการประเมินในรูปแบบ JSON ดังนี้เท่านั้น:
    {
      "totalScore": <คะแนนท่านผู้ทดสอบ>,
      "pros": "<จุดที่ท่านผู้ทดสอบทำได้ดี>",
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
};

router.post('/surgical/2', authMiddleware, async (req, res) => {
    const { fileName, totalChunks } = req.body;
    const tempDir = path.join(__dirname, '../temp');
    const finalFilePath = path.join(__dirname, '../public/uploads', fileName);
    let audioPath = null;
    let fileUrl = null;
    let fileType = null;

    try {
        // Reassemble the file from chunks
        await new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(finalFilePath);
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);

            (async () => {
                for (let i = 0; i < totalChunks; i++) {
                    const chunkPath = path.join(tempDir, `${req.userId}_${i}`);
                    const chunkBuffer = await fs.promises.readFile(chunkPath);
                    writeStream.write(chunkBuffer);
                    await fs.promises.unlink(chunkPath);
                }
                writeStream.end();
            })();
        });

        // console.log('File reassembled successfully');
        const uploadTimestamp = Date.now();

        fileType = getFileType(fileName);

        // Upload the original file to Spaces
        // console.time('Spaces upload');
        fileUrl = await uploadToSpaces(finalFilePath, `surgical-2/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
        // console.timeEnd('Spaces upload');

        if (fileType === 'video') {
            // Audio extraction for transcription
            // console.time('Audio extraction');
            audioPath = `./public/uploads/audio-${uploadTimestamp}.mp3`;
            await new Promise((resolve, reject) => {
                ffmpeg(finalFilePath)
                    .output(audioPath)
                    .audioCodec('libmp3lame')
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });
            // console.timeEnd('Audio extraction');
        } else {
            // For audio files, use the uploaded file directly
            audioPath = finalFilePath;
        }

        // Transcription IApp
        const transcriptionResult = await transcribeAudioIApp(audioPath);
        const transcription = concatenateTranscriptionText(transcriptionResult.output);
        // const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionSurgicalLab2(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 2,
            subject: 'surgical',
            fileUrl: fileUrl,
            fileType: fileType,
            studentAnswer: transcription,
            studentScore: feedbackJson.totalScore,
            isPass: feedbackJson.totalScore >= 60,
            pros: feedbackJson.pros,
            recommendations: feedbackJson.recommendations,
        };

        // console.time('Lab submission');
        await axios.post('http://localhost:3000/api/v1/lab-deployed/submit-lab', labInfo);
        // console.timeEnd('Lab submission');

        // Send response
        res.json({
            feedback: feedbackJson,
            transcription,
            passFailStatus: feedbackJson.totalScore >= 60 ? 'Passed' : 'Failed',
            score: feedbackJson.totalScore,
            pros: feedbackJson.pros,
            recommendations: feedbackJson.recommendations,
            fileUrl: fileUrl,
            fileType: fileType
        });

    } catch (error) {
        console.error('Error processing the file:', error);
        res.status(500).json({ msg: 'Error processing the file', error: error.message });
    } finally {
        // Cleanup
        // console.log('Cleaning up local files');
        [finalFilePath, audioPath].forEach(path => {
            if (path && fs.existsSync(path)) {
                try {
                    fs.unlinkSync(path);
                    // console.log(`Successfully deleted: ${path}`);
                } catch (deleteError) {
                    if (deleteError.code !== 'ENOENT') {
                        console.error(`Failed to delete file: ${path}`, deleteError);
                    }
                }
            }
        });
    }
});

async function processTranscriptionSurgicalLab2(transcription) {
    const answerKey = `
สถานการณ์:
ผู้ป่วยชายอายุ 25 ปี กระดูกต้นขาขวาหักแบบปิด (Closed Fx. Right femur) จากอุบัติเหตุรถมอเตอร์ไซค์ล้ม ขณะนี้ On skeletal traction with weight 7 kgs. วันนี้แพทย์มีแผนการรักษาให้เตรียมผ่าตัด ดังนี้ 
	NPO after midnight
	On 5% D/S/2 1000 cc. IV drip 80 cc./hr.
	Prep skin ขาขวา
	Void ก่อนไป OR
	Pre-medication
	- Diazepam (5 mg.) 1 tab oral hs.

คำถาม: ขอให้ท่านแนะนำการเตรียมร่างกาย ด้านจิตใจ ด้านกฎหมาย และ เอกสารที่เกี่ยวข้องก่อนการผ่าตัดแก่ผู้ป่วยรายนี้

คำตอบ คะแนนเต็ม 100 คะแนน
การเตรียมด้านร่างกาย ประกอบด้วย
- คุณจะต้องงดน้ำและอาหารทางปากทุกชนิดหลังเที่ยงคืนเป็นต้นไป (NPO หลังเที่ยงคืน) (10)
- คุณจะได้รับสารน้ำทางหลอดเลือดดำ (IV FLUID) ตอนเช้าของวันผ่าตัด (10)
- คุณจะได้รับการเตรียมผิวหนังบริเวณผ่าตัด/ขาขวา (10)
- คุณต้องทำความสะอาดร่างกายตั้งแต่ศีรษะจรดปลายเท้า (5) ในตอนเย็น/บ่ายวันก่อนผ่าตัดและเช้าก่อนเข้าห้องผ่าตัด โดยการอาบน้ำ (5) สระผม (5) ตัดเล็บให้สั้น (5)
- ก่อนเข้าห้องผ่าตัดต้องถ่ายปัสสาวะ/ฉี่ก่อน (10)
การเตรียมด้านจิตใจ ประกอบด้วย
- แนะนำลักษณะ สิ่งแวดล้อม บุคลากรที่ผู้ป่วยจะพบในห้องผ่าตัด (5)
- มีการถาม/ประเมินผู้ป่วยถึงความกลัว (5) ความวิตกกังวล (5) เกี่ยวกับการผ่าตัด การได้รับยาสลบ/ยาชาทางช่องไขสันหลัง/การบล็อคหลัง (spinal/epidural block) (5)
- อธิบายการจัดการความปวดหลังผ่าตัด เช่น จะได้รับยาแก้ปวดแบบฉีดในวันแรกหลังผ่าตัด ถ้าปวดให้ขอยาแก้ปวดได้ (10)
- ตอบคำถาม ข้อสงสัยของผู้ป่วย (5)
- ดูแลให้ผู้ป่วยทานยา diazepam ก่อนนอน (5)


3. การเตรียมด้านกฎหมาย และเอกสารที่เกี่ยวข้อง ประกอบด้วย
- อธิบายผลดี/ประโยชน์ของการผ่าตัด (10) เช่น กระดูกจะติดกันเร็วผู้ป่วยจะได้เดินเร็วขึ้น (5) ไม่ต้องนอน/อยู่กับเตียงนาน/ดึงถ่วงน้ำหนัก/ดึงขานาน (5)
- อธิบายภาวะแทรกซ้อนที่อาจเกิดขึ้นได้จากการผ่าตัด (5) จากการได้รับยาระงับความรู้สึก/ยาสลบ/ยาชา (5)  การเสียเลือด/ตกเลือด ปวด (5)
- ให้ผู้ป่วยเซ็นใบยินยอมรับการรักษาโดยการผ่าตัด (10) ยินยอมรับยาระงับความรู้สึก ยินยอมรับเลือดกรณีเสียมาก 
`;

    const checkContent = `
คุณคือผู้ตรวจประเมินผลการปฏิบัติงานของนักศึกษาพยาบาลที่มีประสบการณ์ โปรดประเมินคำตอบของนักศึกษาจาก 'คำตอบของท่านผู้ทดสอบ' เทียบกับ 'เฉลยและเกณฑ์การให้คะแนน' อย่างละเอียด

**หลักการประเมิน:**
1.  **การเปรียบเทียบ:** ให้เปรียบเทียบคำตอบของนักศึกษาโดยเน้นความหมายและเนื้อหาที่ถูกต้องและครบถ้วนตาม 'เฉลยและเกณฑ์การให้คะแนน' ไม่ใช่เพียงแค่คำศัพท์ที่ตรงกันทุกคำ
2.  **การให้คะแนน:** 'เฉลยและเกณฑ์การให้คะแนน' มีประเด็นย่อยพร้อมคะแนนกำกับในวงเล็บ (เช่น (10), (5)) ให้คุณระบุว่าแต่ละประเด็นในเฉลยนั้นมีอยู่ในคำตอบของนักศึกษาหรือไม่
    *   ถ้าประเด็นนั้นปรากฏและถูกต้องสมบูรณ์: ให้คะแนนเต็มสำหรับประเด็นนั้น
    *   ถ้าประเด็นนั้นปรากฏแต่ไม่สมบูรณ์หรือไม่ถูกต้องทั้งหมด: ให้พิจารณาให้คะแนนบางส่วนตามความเหมาะสม (เช่น อาจได้ครึ่งหนึ่งของคะแนนเต็มสำหรับประเด็นนั้น)
    *   ถ้าประเด็นนั้นไม่ปรากฏเลย: ไม่ให้คะแนนสำหรับประเด็นนั้น
3.  **การคำนวณคะแนนรวม:** คำนวณ 'totalScore' จากผลรวมของคะแนนที่ได้รับจากแต่ละประเด็นย่อยในเฉลย
4.  **ข้อดี (pros):** ระบุประเด็นสำคัญใน 'เฉลยและเกณฑ์การให้คะแนน' ที่นักศึกษาสามารถตอบได้ถูกต้อง ชัดเจน และครบถ้วน โดยอธิบายรายละเอียดว่าทำไมจึงถือว่าทำได้ดี
5.  **ข้อเสนอแนะ (recommendations):** ระบุประเด็นสำคัญใน 'เฉลยและเกณฑ์การให้คะแนน' ที่นักศึกษาตอบได้ไม่สมบูรณ์ คลาดเคลื่อน หรือขาดหายไป พร้อมให้คำแนะนำที่เฉพาะเจาะจงเพื่อปรับปรุงในครั้งต่อไป
6.  **ข้อควรทราบ:** ไม่ต้องวิจารณ์เรื่องไวยากรณ์ การสะกดคำ หรือประเด็นอื่นที่ไม่เกี่ยวข้องกับเนื้อหาทางการพยาบาล


นี่คือคำตอบของท่านผู้ทดสอบ: "${transcription}".
ที่คือเฉลย: "${answerKey}".

**รูปแบบผลลัพธ์:**
โปรดสร้างผลการประเมินในรูปแบบ JSON ดังนี้เท่านั้น:
    {
      "totalScore": <คะแนนท่านผู้ทดสอบ>,
      "pros": "<จุดที่ท่านผู้ทดสอบทำได้ดี>",
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
};

router.post('/surgical/3', authMiddleware, async (req, res) => {
    const { fileName, totalChunks } = req.body;
    const tempDir = path.join(__dirname, '../temp');
    const finalFilePath = path.join(__dirname, '../public/uploads', fileName);
    let audioPath = null;
    let fileUrl = null;
    let fileType = null;

    try {
        // Reassemble the file from chunks
        await new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(finalFilePath);
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);

            (async () => {
                for (let i = 0; i < totalChunks; i++) {
                    const chunkPath = path.join(tempDir, `${req.userId}_${i}`);
                    const chunkBuffer = await fs.promises.readFile(chunkPath);
                    writeStream.write(chunkBuffer);
                    await fs.promises.unlink(chunkPath);
                }
                writeStream.end();
            })();
        });

        // console.log('File reassembled successfully');
        const uploadTimestamp = Date.now();

        fileType = getFileType(fileName);

        // Upload the original file to Spaces
        // console.time('Spaces upload');
        fileUrl = await uploadToSpaces(finalFilePath, `surgical-3/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
        // console.timeEnd('Spaces upload');

        if (fileType === 'video') {
            // Audio extraction for transcription
            // console.time('Audio extraction');
            audioPath = `./public/uploads/audio-${uploadTimestamp}.mp3`;
            await new Promise((resolve, reject) => {
                ffmpeg(finalFilePath)
                    .output(audioPath)
                    .audioCodec('libmp3lame')
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });
            // console.timeEnd('Audio extraction');
        } else {
            // For audio files, use the uploaded file directly
            audioPath = finalFilePath;
        }

        // Transcription IApp
        const transcriptionResult = await transcribeAudioIApp(audioPath);
        const transcription = concatenateTranscriptionText(transcriptionResult.output);
        // const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionSurgicalLab3(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 3,
            subject: 'surgical',
            fileUrl: fileUrl,
            fileType: fileType,
            studentAnswer: transcription,
            studentScore: feedbackJson.totalScore,
            isPass: feedbackJson.totalScore >= 60,
            pros: feedbackJson.pros,
            recommendations: feedbackJson.recommendations,
        };

        // console.time('Lab submission');
        await axios.post('http://localhost:3000/api/v1/lab-deployed/submit-lab', labInfo);
        // console.timeEnd('Lab submission');

        // Send response
        res.json({
            feedback: feedbackJson,
            transcription,
            passFailStatus: feedbackJson.totalScore >= 60 ? 'Passed' : 'Failed',
            score: feedbackJson.totalScore,
            pros: feedbackJson.pros,
            recommendations: feedbackJson.recommendations,
            fileUrl: fileUrl,
            fileType: fileType
        });

    } catch (error) {
        console.error('Error processing the file:', error);
        res.status(500).json({ msg: 'Error processing the file', error: error.message });
    } finally {
        // Cleanup
        // console.log('Cleaning up local files');
        [finalFilePath, audioPath].forEach(path => {
            if (path && fs.existsSync(path)) {
                try {
                    fs.unlinkSync(path);
                    // console.log(`Successfully deleted: ${path}`);
                } catch (deleteError) {
                    if (deleteError.code !== 'ENOENT') {
                        console.error(`Failed to delete file: ${path}`, deleteError);
                    }
                }
            }
        });
    }
});

async function processTranscriptionSurgicalLab3(transcription) {
    const answerKey = `
สถานการณ์:
ผู้ป่วยชายอายุ 25 ปี กระดูกต้นขาขวาหักแบบปิด (Closed Fx. Right femur) จากอุบัติเหตุรถมอเตอร์ไซค์ล้ม ขณะนี้ On skeletal traction with weight 7 kgs. วันนี้แพทย์มีแผนการรักษาให้เตรียมผ่าตัด ดังนี้ 
	NPO after midnight
	On 5% D/S/2 1000 cc. IV drip 80 cc./hr.
	Prep skin ขาขวา
	Void ก่อนไป OR
	Pre-medication
	- Diazepam (5 mg.) 1 tab oral hs.

คำถาม: ขอให้ท่านแนะนำการเตรียมร่างกาย ด้านจิตใจ ด้านกฎหมาย และ เอกสารที่เกี่ยวข้องก่อนการผ่าตัดแก่ผู้ป่วยรายนี้

คำตอบ คะแนนเต็ม 100 คะแนน
การเตรียมด้านร่างกาย ประกอบด้วย
- คุณจะต้องงดน้ำและอาหารทางปากทุกชนิดหลังเที่ยงคืนเป็นต้นไป (NPO หลังเที่ยงคืน) (10)
- คุณจะได้รับสารน้ำทางหลอดเลือดดำ (IV FLUID) ตอนเช้าของวันผ่าตัด (10)
- คุณจะได้รับการเตรียมผิวหนังบริเวณผ่าตัด/ขาขวา (10)
- คุณต้องทำความสะอาดร่างกายตั้งแต่ศีรษะจรดปลายเท้า (5) ในตอนเย็น/บ่ายวันก่อนผ่าตัดและเช้าก่อนเข้าห้องผ่าตัด โดยการอาบน้ำ (5) สระผม (5) ตัดเล็บให้สั้น (5)
- ก่อนเข้าห้องผ่าตัดต้องถ่ายปัสสาวะ/ฉี่ก่อน (10)
การเตรียมด้านจิตใจ ประกอบด้วย
- แนะนำลักษณะ สิ่งแวดล้อม บุคลากรที่ผู้ป่วยจะพบในห้องผ่าตัด (5)
- มีการถาม/ประเมินผู้ป่วยถึงความกลัว (5) ความวิตกกังวล (5) เกี่ยวกับการผ่าตัด การได้รับยาสลบ/ยาชาทางช่องไขสันหลัง/การบล็อคหลัง (spinal/epidural block) (5)
- อธิบายการจัดการความปวดหลังผ่าตัด เช่น จะได้รับยาแก้ปวดแบบฉีดในวันแรกหลังผ่าตัด ถ้าปวดให้ขอยาแก้ปวดได้ (10)
- ตอบคำถาม ข้อสงสัยของผู้ป่วย (5)
- ดูแลให้ผู้ป่วยทานยา diazepam ก่อนนอน (5)


3. การเตรียมด้านกฎหมาย และเอกสารที่เกี่ยวข้อง ประกอบด้วย
- อธิบายผลดี/ประโยชน์ของการผ่าตัด (10) เช่น กระดูกจะติดกันเร็วผู้ป่วยจะได้เดินเร็วขึ้น (5) ไม่ต้องนอน/อยู่กับเตียงนาน/ดึงถ่วงน้ำหนัก/ดึงขานาน (5)
- อธิบายภาวะแทรกซ้อนที่อาจเกิดขึ้นได้จากการผ่าตัด (5) จากการได้รับยาระงับความรู้สึก/ยาสลบ/ยาชา (5)  การเสียเลือด/ตกเลือด ปวด (5)
- ให้ผู้ป่วยเซ็นใบยินยอมรับการรักษาโดยการผ่าตัด (10) ยินยอมรับยาระงับความรู้สึก ยินยอมรับเลือดกรณีเสียมาก 
`;

    const checkContent = `
คุณคือผู้ตรวจประเมินผลการปฏิบัติงานของนักศึกษาพยาบาลที่มีประสบการณ์ โปรดประเมินคำตอบของนักศึกษาจาก 'คำตอบของท่านผู้ทดสอบ' เทียบกับ 'เฉลยและเกณฑ์การให้คะแนน' อย่างละเอียด

**หลักการประเมิน:**
1.  **การเปรียบเทียบ:** ให้เปรียบเทียบคำตอบของนักศึกษาโดยเน้นความหมายและเนื้อหาที่ถูกต้องและครบถ้วนตาม 'เฉลยและเกณฑ์การให้คะแนน' ไม่ใช่เพียงแค่คำศัพท์ที่ตรงกันทุกคำ
2.  **การให้คะแนน:** 'เฉลยและเกณฑ์การให้คะแนน' มีประเด็นย่อยพร้อมคะแนนกำกับในวงเล็บ (เช่น (10), (5)) ให้คุณระบุว่าแต่ละประเด็นในเฉลยนั้นมีอยู่ในคำตอบของนักศึกษาหรือไม่
    *   ถ้าประเด็นนั้นปรากฏและถูกต้องสมบูรณ์: ให้คะแนนเต็มสำหรับประเด็นนั้น
    *   ถ้าประเด็นนั้นปรากฏแต่ไม่สมบูรณ์หรือไม่ถูกต้องทั้งหมด: ให้พิจารณาให้คะแนนบางส่วนตามความเหมาะสม (เช่น อาจได้ครึ่งหนึ่งของคะแนนเต็มสำหรับประเด็นนั้น)
    *   ถ้าประเด็นนั้นไม่ปรากฏเลย: ไม่ให้คะแนนสำหรับประเด็นนั้น
3.  **การคำนวณคะแนนรวม:** คำนวณ 'totalScore' จากผลรวมของคะแนนที่ได้รับจากแต่ละประเด็นย่อยในเฉลย
4.  **ข้อดี (pros):** ระบุประเด็นสำคัญใน 'เฉลยและเกณฑ์การให้คะแนน' ที่นักศึกษาสามารถตอบได้ถูกต้อง ชัดเจน และครบถ้วน โดยอธิบายรายละเอียดว่าทำไมจึงถือว่าทำได้ดี
5.  **ข้อเสนอแนะ (recommendations):** ระบุประเด็นสำคัญใน 'เฉลยและเกณฑ์การให้คะแนน' ที่นักศึกษาตอบได้ไม่สมบูรณ์ คลาดเคลื่อน หรือขาดหายไป พร้อมให้คำแนะนำที่เฉพาะเจาะจงเพื่อปรับปรุงในครั้งต่อไป
6.  **ข้อควรทราบ:** ไม่ต้องวิจารณ์เรื่องไวยากรณ์ การสะกดคำ หรือประเด็นอื่นที่ไม่เกี่ยวข้องกับเนื้อหาทางการพยาบาล


นี่คือคำตอบของท่านผู้ทดสอบ: "${transcription}".
ที่คือเฉลย: "${answerKey}".

**รูปแบบผลลัพธ์:**
โปรดสร้างผลการประเมินในรูปแบบ JSON ดังนี้เท่านั้น:
    {
      "totalScore": <คะแนนท่านผู้ทดสอบ>,
      "pros": "<จุดที่ท่านผู้ทดสอบทำได้ดี>",
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
};

router.post('/surgical/4', authMiddleware, async (req, res) => {
    const { fileName, totalChunks } = req.body;
    const tempDir = path.join(__dirname, '../temp');
    const finalFilePath = path.join(__dirname, '../public/uploads', fileName);
    let audioPath = null;
    let fileUrl = null;
    let fileType = null;

    try {
        // Reassemble the file from chunks
        await new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(finalFilePath);
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);

            (async () => {
                for (let i = 0; i < totalChunks; i++) {
                    const chunkPath = path.join(tempDir, `${req.userId}_${i}`);
                    const chunkBuffer = await fs.promises.readFile(chunkPath);
                    writeStream.write(chunkBuffer);
                    await fs.promises.unlink(chunkPath);
                }
                writeStream.end();
            })();
        });

        // console.log('File reassembled successfully');
        const uploadTimestamp = Date.now();

        fileType = getFileType(fileName);

        // Upload the original file to Spaces
        // console.time('Spaces upload');
        fileUrl = await uploadToSpaces(finalFilePath, `surgical-4/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
        // console.timeEnd('Spaces upload');

        if (fileType === 'video') {
            // Audio extraction for transcription
            // console.time('Audio extraction');
            audioPath = `./public/uploads/audio-${uploadTimestamp}.mp3`;
            await new Promise((resolve, reject) => {
                ffmpeg(finalFilePath)
                    .output(audioPath)
                    .audioCodec('libmp3lame')
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });
            // console.timeEnd('Audio extraction');
        } else {
            // For audio files, use the uploaded file directly
            audioPath = finalFilePath;
        }

        // Transcription IApp
        const transcriptionResult = await transcribeAudioIApp(audioPath);
        const transcription = concatenateTranscriptionText(transcriptionResult.output);
        // const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionSurgicalLab4(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 4,
            subject: 'surgical',
            fileUrl: fileUrl,
            fileType: fileType,
            studentAnswer: transcription,
            studentScore: feedbackJson.totalScore,
            isPass: feedbackJson.totalScore >= 60,
            pros: feedbackJson.pros,
            recommendations: feedbackJson.recommendations,
        };

        // console.time('Lab submission');
        await axios.post('http://localhost:3000/api/v1/lab-deployed/submit-lab', labInfo);
        // console.timeEnd('Lab submission');

        // Send response
        res.json({
            feedback: feedbackJson,
            transcription,
            passFailStatus: feedbackJson.totalScore >= 60 ? 'Passed' : 'Failed',
            score: feedbackJson.totalScore,
            pros: feedbackJson.pros,
            recommendations: feedbackJson.recommendations,
            fileUrl: fileUrl,
            fileType: fileType
        });

    } catch (error) {
        console.error('Error processing the file:', error);
        res.status(500).json({ msg: 'Error processing the file', error: error.message });
    } finally {
        // Cleanup
        // console.log('Cleaning up local files');
        [finalFilePath, audioPath].forEach(path => {
            if (path && fs.existsSync(path)) {
                try {
                    fs.unlinkSync(path);
                    // console.log(`Successfully deleted: ${path}`);
                } catch (deleteError) {
                    if (deleteError.code !== 'ENOENT') {
                        console.error(`Failed to delete file: ${path}`, deleteError);
                    }
                }
            }
        });
    }
});

async function processTranscriptionSurgicalLab4(transcription) {
    const answerKey = `
สถานการณ์:
ผู้ป่วยชายอายุ 25 ปี กระดูกต้นขาขวาหักแบบปิด (Closed Fx. Right femur) จากอุบัติเหตุรถมอเตอร์ไซค์ล้ม ขณะนี้ On skeletal traction with weight 7 kgs. วันนี้แพทย์มีแผนการรักษาให้เตรียมผ่าตัด ดังนี้ 
	NPO after midnight
	On 5% D/S/2 1000 cc. IV drip 80 cc./hr.
	Prep skin ขาขวา
	Void ก่อนไป OR
	Pre-medication
	- Diazepam (5 mg.) 1 tab oral hs.

คำถาม: ขอให้ท่านแนะนำการเตรียมร่างกาย ด้านจิตใจ ด้านกฎหมาย และ เอกสารที่เกี่ยวข้องก่อนการผ่าตัดแก่ผู้ป่วยรายนี้

คำตอบ คะแนนเต็ม 100 คะแนน
การเตรียมด้านร่างกาย ประกอบด้วย
- คุณจะต้องงดน้ำและอาหารทางปากทุกชนิดหลังเที่ยงคืนเป็นต้นไป (NPO หลังเที่ยงคืน) (10)
- คุณจะได้รับสารน้ำทางหลอดเลือดดำ (IV FLUID) ตอนเช้าของวันผ่าตัด (10)
- คุณจะได้รับการเตรียมผิวหนังบริเวณผ่าตัด/ขาขวา (10)
- คุณต้องทำความสะอาดร่างกายตั้งแต่ศีรษะจรดปลายเท้า (5) ในตอนเย็น/บ่ายวันก่อนผ่าตัดและเช้าก่อนเข้าห้องผ่าตัด โดยการอาบน้ำ (5) สระผม (5) ตัดเล็บให้สั้น (5)
- ก่อนเข้าห้องผ่าตัดต้องถ่ายปัสสาวะ/ฉี่ก่อน (10)
การเตรียมด้านจิตใจ ประกอบด้วย
- แนะนำลักษณะ สิ่งแวดล้อม บุคลากรที่ผู้ป่วยจะพบในห้องผ่าตัด (5)
- มีการถาม/ประเมินผู้ป่วยถึงความกลัว (5) ความวิตกกังวล (5) เกี่ยวกับการผ่าตัด การได้รับยาสลบ/ยาชาทางช่องไขสันหลัง/การบล็อคหลัง (spinal/epidural block) (5)
- อธิบายการจัดการความปวดหลังผ่าตัด เช่น จะได้รับยาแก้ปวดแบบฉีดในวันแรกหลังผ่าตัด ถ้าปวดให้ขอยาแก้ปวดได้ (10)
- ตอบคำถาม ข้อสงสัยของผู้ป่วย (5)
- ดูแลให้ผู้ป่วยทานยา diazepam ก่อนนอน (5)


3. การเตรียมด้านกฎหมาย และเอกสารที่เกี่ยวข้อง ประกอบด้วย
- อธิบายผลดี/ประโยชน์ของการผ่าตัด (10) เช่น กระดูกจะติดกันเร็วผู้ป่วยจะได้เดินเร็วขึ้น (5) ไม่ต้องนอน/อยู่กับเตียงนาน/ดึงถ่วงน้ำหนัก/ดึงขานาน (5)
- อธิบายภาวะแทรกซ้อนที่อาจเกิดขึ้นได้จากการผ่าตัด (5) จากการได้รับยาระงับความรู้สึก/ยาสลบ/ยาชา (5)  การเสียเลือด/ตกเลือด ปวด (5)
- ให้ผู้ป่วยเซ็นใบยินยอมรับการรักษาโดยการผ่าตัด (10) ยินยอมรับยาระงับความรู้สึก ยินยอมรับเลือดกรณีเสียมาก 
`;

    const checkContent = `
คุณคือผู้ตรวจประเมินผลการปฏิบัติงานของนักศึกษาพยาบาลที่มีประสบการณ์ โปรดประเมินคำตอบของนักศึกษาจาก 'คำตอบของท่านผู้ทดสอบ' เทียบกับ 'เฉลยและเกณฑ์การให้คะแนน' อย่างละเอียด

**หลักการประเมิน:**
1.  **การเปรียบเทียบ:** ให้เปรียบเทียบคำตอบของนักศึกษาโดยเน้นความหมายและเนื้อหาที่ถูกต้องและครบถ้วนตาม 'เฉลยและเกณฑ์การให้คะแนน' ไม่ใช่เพียงแค่คำศัพท์ที่ตรงกันทุกคำ
2.  **การให้คะแนน:** 'เฉลยและเกณฑ์การให้คะแนน' มีประเด็นย่อยพร้อมคะแนนกำกับในวงเล็บ (เช่น (10), (5)) ให้คุณระบุว่าแต่ละประเด็นในเฉลยนั้นมีอยู่ในคำตอบของนักศึกษาหรือไม่
    *   ถ้าประเด็นนั้นปรากฏและถูกต้องสมบูรณ์: ให้คะแนนเต็มสำหรับประเด็นนั้น
    *   ถ้าประเด็นนั้นปรากฏแต่ไม่สมบูรณ์หรือไม่ถูกต้องทั้งหมด: ให้พิจารณาให้คะแนนบางส่วนตามความเหมาะสม (เช่น อาจได้ครึ่งหนึ่งของคะแนนเต็มสำหรับประเด็นนั้น)
    *   ถ้าประเด็นนั้นไม่ปรากฏเลย: ไม่ให้คะแนนสำหรับประเด็นนั้น
3.  **การคำนวณคะแนนรวม:** คำนวณ 'totalScore' จากผลรวมของคะแนนที่ได้รับจากแต่ละประเด็นย่อยในเฉลย
4.  **ข้อดี (pros):** ระบุประเด็นสำคัญใน 'เฉลยและเกณฑ์การให้คะแนน' ที่นักศึกษาสามารถตอบได้ถูกต้อง ชัดเจน และครบถ้วน โดยอธิบายรายละเอียดว่าทำไมจึงถือว่าทำได้ดี
5.  **ข้อเสนอแนะ (recommendations):** ระบุประเด็นสำคัญใน 'เฉลยและเกณฑ์การให้คะแนน' ที่นักศึกษาตอบได้ไม่สมบูรณ์ คลาดเคลื่อน หรือขาดหายไป พร้อมให้คำแนะนำที่เฉพาะเจาะจงเพื่อปรับปรุงในครั้งต่อไป
6.  **ข้อควรทราบ:** ไม่ต้องวิจารณ์เรื่องไวยากรณ์ การสะกดคำ หรือประเด็นอื่นที่ไม่เกี่ยวข้องกับเนื้อหาทางการพยาบาล


นี่คือคำตอบของท่านผู้ทดสอบ: "${transcription}".
ที่คือเฉลย: "${answerKey}".

**รูปแบบผลลัพธ์:**
โปรดสร้างผลการประเมินในรูปแบบ JSON ดังนี้เท่านั้น:
    {
      "totalScore": <คะแนนท่านผู้ทดสอบ>,
      "pros": "<จุดที่ท่านผู้ทดสอบทำได้ดี>",
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
};

router.post('/surgical/5', authMiddleware, async (req, res) => {
    const { fileName, totalChunks } = req.body;
    const tempDir = path.join(__dirname, '../temp');
    const finalFilePath = path.join(__dirname, '../public/uploads', fileName);
    let audioPath = null;
    let fileUrl = null;
    let fileType = null;

    try {
        // Reassemble the file from chunks
        await new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(finalFilePath);
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);

            (async () => {
                for (let i = 0; i < totalChunks; i++) {
                    const chunkPath = path.join(tempDir, `${req.userId}_${i}`);
                    const chunkBuffer = await fs.promises.readFile(chunkPath);
                    writeStream.write(chunkBuffer);
                    await fs.promises.unlink(chunkPath);
                }
                writeStream.end();
            })();
        });

        // console.log('File reassembled successfully');
        const uploadTimestamp = Date.now();

        fileType = getFileType(fileName);

        // Upload the original file to Spaces
        // console.time('Spaces upload');
        fileUrl = await uploadToSpaces(finalFilePath, `surgical-5/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
        // console.timeEnd('Spaces upload');

        if (fileType === 'video') {
            // Audio extraction for transcription
            // console.time('Audio extraction');
            audioPath = `./public/uploads/audio-${uploadTimestamp}.mp3`;
            await new Promise((resolve, reject) => {
                ffmpeg(finalFilePath)
                    .output(audioPath)
                    .audioCodec('libmp3lame')
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });
            // console.timeEnd('Audio extraction');
        } else {
            // For audio files, use the uploaded file directly
            audioPath = finalFilePath;
        }

        // Transcription IApp
        const transcriptionResult = await transcribeAudioIApp(audioPath);
        const transcription = concatenateTranscriptionText(transcriptionResult.output);
        // const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionSurgicalLab5(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 5,
            subject: 'surgical',
            fileUrl: fileUrl,
            fileType: fileType,
            studentAnswer: transcription,
            studentScore: feedbackJson.totalScore,
            isPass: feedbackJson.totalScore >= 60,
            pros: feedbackJson.pros,
            recommendations: feedbackJson.recommendations,
        };

        // console.time('Lab submission');
        await axios.post('http://localhost:3000/api/v1/lab-deployed/submit-lab', labInfo);
        // console.timeEnd('Lab submission');

        // Send response
        res.json({
            feedback: feedbackJson,
            transcription,
            passFailStatus: feedbackJson.totalScore >= 60 ? 'Passed' : 'Failed',
            score: feedbackJson.totalScore,
            pros: feedbackJson.pros,
            recommendations: feedbackJson.recommendations,
            fileUrl: fileUrl,
            fileType: fileType
        });

    } catch (error) {
        console.error('Error processing the file:', error);
        res.status(500).json({ msg: 'Error processing the file', error: error.message });
    } finally {
        // Cleanup
        // console.log('Cleaning up local files');
        [finalFilePath, audioPath].forEach(path => {
            if (path && fs.existsSync(path)) {
                try {
                    fs.unlinkSync(path);
                    // console.log(`Successfully deleted: ${path}`);
                } catch (deleteError) {
                    if (deleteError.code !== 'ENOENT') {
                        console.error(`Failed to delete file: ${path}`, deleteError);
                    }
                }
            }
        });
    }
});

async function processTranscriptionSurgicalLab5(transcription) {
    const answerKey = `
สถานการณ์:
ผู้ป่วยชายอายุ 25 ปี กระดูกต้นขาขวาหักแบบปิด (Closed Fx. Right femur) จากอุบัติเหตุรถมอเตอร์ไซค์ล้ม ขณะนี้ On skeletal traction with weight 7 kgs. วันนี้แพทย์มีแผนการรักษาให้เตรียมผ่าตัด ดังนี้ 
	NPO after midnight
	On 5% D/S/2 1000 cc. IV drip 80 cc./hr.
	Prep skin ขาขวา
	Void ก่อนไป OR
	Pre-medication
	- Diazepam (5 mg.) 1 tab oral hs.

คำถาม: ขอให้ท่านแนะนำการเตรียมร่างกาย ด้านจิตใจ ด้านกฎหมาย และ เอกสารที่เกี่ยวข้องก่อนการผ่าตัดแก่ผู้ป่วยรายนี้

คำตอบ คะแนนเต็ม 100 คะแนน
การเตรียมด้านร่างกาย ประกอบด้วย
- คุณจะต้องงดน้ำและอาหารทางปากทุกชนิดหลังเที่ยงคืนเป็นต้นไป (NPO หลังเที่ยงคืน) (10)
- คุณจะได้รับสารน้ำทางหลอดเลือดดำ (IV FLUID) ตอนเช้าของวันผ่าตัด (10)
- คุณจะได้รับการเตรียมผิวหนังบริเวณผ่าตัด/ขาขวา (10)
- คุณต้องทำความสะอาดร่างกายตั้งแต่ศีรษะจรดปลายเท้า (5) ในตอนเย็น/บ่ายวันก่อนผ่าตัดและเช้าก่อนเข้าห้องผ่าตัด โดยการอาบน้ำ (5) สระผม (5) ตัดเล็บให้สั้น (5)
- ก่อนเข้าห้องผ่าตัดต้องถ่ายปัสสาวะ/ฉี่ก่อน (10)
การเตรียมด้านจิตใจ ประกอบด้วย
- แนะนำลักษณะ สิ่งแวดล้อม บุคลากรที่ผู้ป่วยจะพบในห้องผ่าตัด (5)
- มีการถาม/ประเมินผู้ป่วยถึงความกลัว (5) ความวิตกกังวล (5) เกี่ยวกับการผ่าตัด การได้รับยาสลบ/ยาชาทางช่องไขสันหลัง/การบล็อคหลัง (spinal/epidural block) (5)
- อธิบายการจัดการความปวดหลังผ่าตัด เช่น จะได้รับยาแก้ปวดแบบฉีดในวันแรกหลังผ่าตัด ถ้าปวดให้ขอยาแก้ปวดได้ (10)
- ตอบคำถาม ข้อสงสัยของผู้ป่วย (5)
- ดูแลให้ผู้ป่วยทานยา diazepam ก่อนนอน (5)


3. การเตรียมด้านกฎหมาย และเอกสารที่เกี่ยวข้อง ประกอบด้วย
- อธิบายผลดี/ประโยชน์ของการผ่าตัด (10) เช่น กระดูกจะติดกันเร็วผู้ป่วยจะได้เดินเร็วขึ้น (5) ไม่ต้องนอน/อยู่กับเตียงนาน/ดึงถ่วงน้ำหนัก/ดึงขานาน (5)
- อธิบายภาวะแทรกซ้อนที่อาจเกิดขึ้นได้จากการผ่าตัด (5) จากการได้รับยาระงับความรู้สึก/ยาสลบ/ยาชา (5)  การเสียเลือด/ตกเลือด ปวด (5)
- ให้ผู้ป่วยเซ็นใบยินยอมรับการรักษาโดยการผ่าตัด (10) ยินยอมรับยาระงับความรู้สึก ยินยอมรับเลือดกรณีเสียมาก 
`;

    const checkContent = `
คุณคือผู้ตรวจประเมินผลการปฏิบัติงานของนักศึกษาพยาบาลที่มีประสบการณ์ โปรดประเมินคำตอบของนักศึกษาจาก 'คำตอบของท่านผู้ทดสอบ' เทียบกับ 'เฉลยและเกณฑ์การให้คะแนน' อย่างละเอียด

**หลักการประเมิน:**
1.  **การเปรียบเทียบ:** ให้เปรียบเทียบคำตอบของนักศึกษาโดยเน้นความหมายและเนื้อหาที่ถูกต้องและครบถ้วนตาม 'เฉลยและเกณฑ์การให้คะแนน' ไม่ใช่เพียงแค่คำศัพท์ที่ตรงกันทุกคำ
2.  **การให้คะแนน:** 'เฉลยและเกณฑ์การให้คะแนน' มีประเด็นย่อยพร้อมคะแนนกำกับในวงเล็บ (เช่น (10), (5)) ให้คุณระบุว่าแต่ละประเด็นในเฉลยนั้นมีอยู่ในคำตอบของนักศึกษาหรือไม่
    *   ถ้าประเด็นนั้นปรากฏและถูกต้องสมบูรณ์: ให้คะแนนเต็มสำหรับประเด็นนั้น
    *   ถ้าประเด็นนั้นปรากฏแต่ไม่สมบูรณ์หรือไม่ถูกต้องทั้งหมด: ให้พิจารณาให้คะแนนบางส่วนตามความเหมาะสม (เช่น อาจได้ครึ่งหนึ่งของคะแนนเต็มสำหรับประเด็นนั้น)
    *   ถ้าประเด็นนั้นไม่ปรากฏเลย: ไม่ให้คะแนนสำหรับประเด็นนั้น
3.  **การคำนวณคะแนนรวม:** คำนวณ 'totalScore' จากผลรวมของคะแนนที่ได้รับจากแต่ละประเด็นย่อยในเฉลย
4.  **ข้อดี (pros):** ระบุประเด็นสำคัญใน 'เฉลยและเกณฑ์การให้คะแนน' ที่นักศึกษาสามารถตอบได้ถูกต้อง ชัดเจน และครบถ้วน โดยอธิบายรายละเอียดว่าทำไมจึงถือว่าทำได้ดี
5.  **ข้อเสนอแนะ (recommendations):** ระบุประเด็นสำคัญใน 'เฉลยและเกณฑ์การให้คะแนน' ที่นักศึกษาตอบได้ไม่สมบูรณ์ คลาดเคลื่อน หรือขาดหายไป พร้อมให้คำแนะนำที่เฉพาะเจาะจงเพื่อปรับปรุงในครั้งต่อไป
6.  **ข้อควรทราบ:** ไม่ต้องวิจารณ์เรื่องไวยากรณ์ การสะกดคำ หรือประเด็นอื่นที่ไม่เกี่ยวข้องกับเนื้อหาทางการพยาบาล


นี่คือคำตอบของท่านผู้ทดสอบ: "${transcription}".
ที่คือเฉลย: "${answerKey}".

**รูปแบบผลลัพธ์:**
โปรดสร้างผลการประเมินในรูปแบบ JSON ดังนี้เท่านั้น:
    {
      "totalScore": <คะแนนท่านผู้ทดสอบ>,
      "pros": "<จุดที่ท่านผู้ทดสอบทำได้ดี>",
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
};

/*
MEDICAL NURSING
*/

module.exports = router;