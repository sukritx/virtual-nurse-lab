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

คำถาม:
ขอให้ท่านแนะนำการเตรียมร่างกาย ด้านจิตใจ ด้านกฎหมาย และ เอกสารที่เกี่ยวข้องก่อนการผ่าตัดแก่ผู้ป่วยรายนี้

เฉลย:
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

คำตอบ คะแนนเต็ม 100 คะแนน
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
ผู้ป่วยชายอายุ 25 ปี กระดูกต้นขาขวาหักแบบปิด (Closed Fx. Right femur) จากอุบัติเหตุรถมอเตอร์ไซค์ล้ม ขณะนี้ On skeletal traction with weight 7 kgห. วันนี้มีแผนการรักษาให้เตรียมผ่าตัดดังนี้ 
	NPO after midnight
	On 5% D/S/2 1000 cc. IV drip 80 cc./hr.
	Prep skin ขาขวา
	Void ก่อนไป OR
	Pre-medication
	- Diazepam (5 mg.) 1 tab oral hs.

คำถาม:
จงอธิบายการเตรียมผิวหนังบริเวณผ่าตัดสำหรับผู้ป่วยรายนี้ ในประเด็นต่อไปนี้
1. วัตถุประสงค์ของการเตรียมผิวหนังบริเวณผ่าตัด
2. ขอบเขตบริเวณที่จะเตรียมผิวหนัง
3. การเตรียมผิวหนังบริเวณผ่าตัดตอนบ่าย/เย็นก่อนวันผ่าตัด
4. การเตรียมผิวหนังบริเวณผ่าตัดตอนเช้าวันผ่าตัด

เฉลย:
1.) อธิบายวัตถุประสงค์ของการเตรียมผิวหนังบริเวณผ่าตัด (15)
- ลดจำนวนเชื้อโรค (residual and transient microorganisms) บริเวณที่จะผ่าตัด
 - ป้องกัน/ลดโอกาสการติดเชื้อ
 - กำจัดสิ่งสกปรก ขน ที่อยู่บริเวณผิวหนัง
2.) ขอบเขตบริเวณที่จะเตรียมผิวหนัง (5)
ขาขวาทั้งขา
3.) การเตรียมผิวหนังบริเวณผ่าตัดตอนบ่าย/เย็นก่อนวันผ่าตัด ตามลำดับดังนี้ (40)
1. เช็ด/ล้างด้วยน้ำสะอาดให้ผิวหนังเปียกก่อน
2. ฟอกด้วย Hibiscrub (chlorhexidine) หรือ Providone-Iodine/providine scrub แล้วเช็ด/ล้างฟองออกให้สะอาด
3. ทา/paint ด้วย 0.5%  Tr. Hibitain in alcohol หรือ 10% Providone-Iodine Solution
4. ทำความสะอาดแผล pin
4.) การเตรียมผิวหนังบริเวณผ่าตัดตอนเช้าวันผ่าตัด ตามลำดับดังนี้ (40)
1. โกนขนด้วยมีดโกน/เครื่องโกนไฟฟ้าก่อน 
2. เช็ด/ล้างด้วยน้ำสะอาดให้ผิวหนังเปียกก่อน
3. ฟอกด้วย Hibiscrub (chlorhexidine) หรือ Providone-Iodine/providine scrub แล้วเช็ด/ล้างฟองออกให้สะอาด
4. ทา/paint ด้วย 0.5%  Tr. Hibitain in alcohol หรือ 10% Providone-Iodine Solution
5. ทำความสะอาดแผล pin

คำตอบ คะแนนเต็ม 100 คะแนน

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
ผู้ป่วยหญิงอายุ 65 ปี การศึกษา ม.3 การวินิจฉัยโรค Closed Fx. Rt. Intertrochanteric หลังผ่าตัด ORIF with PFNA Rt leg (Open Reduction and Internal Fixation with Proximal Femoral Nail Antirotation right leg) เมื่อวันที่ 1 ของเดือนนี้
อาการปัจจุบัน: อาการทั่วไปดี มีแผลผ่าตัดบริเวณสะโพกขวาปิดก๊อซไว้ แห้งดี ปวดเล็กน้อยเวลาขยับ เดินได้ดีโดยใช้ Walker วันนี้ (หลังผ่าตัดวันที่ 4) แพทย์อนุญาตให้กลับบ้านได้ โดยมีแผนการรักษาก่อนกลับบ้านดังนี้ 
	- D/C
	- ตัดไหมเมื่อครบ 2 สัปดาห์หลังผ่าตัด
	- F/U 1 เดือน (Film Rt. Leg ก่อนพบแพทย์)
	Home-medication
	- Naproxen (500 mg.) 1 x 2 pc # 10
	- Paracetamol (500 mg) 1 x prn q 4-6 hr. # 20
	- Caltrate 600 mg 1 x 1 OD pc # 30


คำถาม: ขอให้ท่านเตรียมผู้ป่วยก่อนกลับบ้านแก่ผู้ป่วยรายนี้ โดยให้ครอบคลุมตามหลัก D-METHOD

เฉลย:
1. D: Diagnosis/Disease ความรู้เรื่องโรคที่เป็นอยู่ถึงสาเหตุ อาการ การปฏิบัติตัวที่ถูกต้อง
-ความรู้เรื่องโรคที่เป็นอยู่ กระดูกสะโพกหัก ได้รับการรักษาโดยการผ่าตัดใส่เหล็กยึด/ดามไว้ ผู้ป่วยอยู่ในระยะฟื้นฟูสภาพ รอให้กระดูกติด ซึ่งต้องใช้เวลาอย่างน้อย 1 เดือน (10)
2. M: Medicine การใช้ยาอย่างละเอียด สรรพคุณของยา ขนาด วิธีใช้ ข้อควรระวังในการใช้ยา การสังเกตภาวะแทรกซ้อน ข้อห้ามในการใช้ยา
- ยา Naproxen เป็นยาแก้ปวดแก้อักเสบที่ทำให้เกิดการระคายเคือง/กัดกระเพาะได้ ทาน/กินครั้งละ 1 เม็ดทันที่หลังอาหารเช้าและเย็น สังเกตอาการปวดท้องและอุจจาระสีเข้มด้วย (10)
- ยา Paracetamol แก้ปวดลดไข้ ทาน/กินเมื่อมีอาการ ครั้งละ 1 เม็ด (10)
- ยา Caltrate เป็นแคลเซียมช่วยเสริมสร้างกระดูก ดื่มน้ำตามมากๆ ทาน/กินวันละ 1 เม็ดหลังอาหาร (10)
3. E: Environment/ Economic  การจัดการกับสิ่งแวดล้อมให้เหมาะสมกับสภาวะสุขภาพ 
- ผู้ป่วยต้องเดินโดยใช้ Walker ช่วย ไม่ควร หรือ หลีกเลี่ยงการเดินขึ้นลงบันได (5)
- สภาพแวดล้อมต้องปลอดภัย มีแสงสว่างเพียงพอ พื้นไม่ควรมีความต่างระดับ พื้นไม่ลื่น มีราวจับป้องกันการหกล้ม (5)
- ห้องน้ำต้องเป็นชักโครก (5)
- นอนบนเตียง (5)
4. T: Treatment การรักษาที่จะต้องทำต่อที่บ้าน สังเกตอาการผิดปกติของตนเอง ทักษะที่จำเป็นตามแผนการรักษา เช่นการทำแผล ความรู้ที่จะจัดการกับภาวะฉุกเฉินด้วยตนเอง อย่างเหมาะสมก่อนมาถึงสถานพยาบาล
- การรักษาที่จะต้องทำต่อที่บ้านหรือสถานบริการใกล้บ้าน ได้แก่ การไปทำแผล ตัดไหมในวันที่ 15 ของเดือนนี้ (10)
- สังเกตอาการผิดปกติของตนเองที่อาจต้องมาพบแพทย์ก่อนวันนัด ได้แก่ แผลมีอาการของการติดเชื้อ เช่น มีไข้สูง ปวด แผลบวม แดง มีสารคัดหลั่งผิดปกติ หนอง กลิ่นเหม็น เป็นต้น ปวดขามากหรือมีการกระทบกระแทกบริเวณที่ผ่าตัดไป (10)
5. H: Health การส่งเสริมฟื้นฟูสภาพทางด้านร่างกายและจิตใจ ตลอดจนการป้องกันภาวะแทรกซ้อนต่างๆ
- ออกกำลังกายตามที่ได้รับการสอนเหมือนตอนที่อยู่โรงพยาบาล (5)
- ดูแลจิตใจให้สบาย ไม่เครียด (5)
6. O: Outpatient  referral การมาตรวจตามนัด การติดต่อขอความช่วยเหลือจากสถานพยาบาลใกล้บ้านในกรณีเกิดภาวะฉุกเฉินตลอดจนการส่งต่อผู้ป่วยให้ได้รับการดูแลต่อเนื่อง
- มาตรวจ/พบแพทย์หลังจากนี้ 1 เดือนตามวัน เวลาที่ระบุในใบนัด (5)
- เมื่อมาถึงโรงพยาบาลให้ผู้ป่วยไปเอ็กซเรย์ก่อนที่จะไปห้องตรวจ (5)
- หากไม่สามารถมาตามวันนัดได้หรือลืมให้ติดต่อทางโรงพยาบาลตามเบอร์โทรศัพท์ที่อยู่ในใบนัด/หรือเบอร์ที่พยาบาลให้ไว้ (5)
7. D: Diet  การเลือกรับประทานอาหารได้เหมาะสมกับโรคและข้อจำกัดด้านสุขภาพ
- รับประทานอาหารให้ครบ 5 หมู่ โดยเฉพาะอาหารที่จะช่วยให้กระดูกติดเร็ว แผลหายเร็ว เช่น เนื้อสัตว์ ปลา นม ไข่ อาหารที่มีวิตามินซีสูง แคลเซียมสูง (10)

คำตอบ คะแนนเต็ม 100 คะแนน

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
	ผู้ป่วยชายอายุ 65 ปี ตรวจพบก้อนบริเวณปอดข้างขวา แพทย์วินิจฉัยว่าเป็นมะเร็งปอด (lung cancer) ได้รับการผ่าตัด Right thoracotomy to RLL lobectomy 

ผลการตรวจร่างกาย: 
	หลังผ่าตัด ผู้ป่วยมีแผลผ่าตัดบริเวณทรวงอกด้านขวาปิดก๊อซไว้แห้งดี ปวดแผลผ่าตัด pain score = 3  Retained right ICD with under water sealed น้ำในหลอดแก้วยาวในขวดรองรับไม่ fluctuate สารเหลวในขวดรองรับสีแดง คลำผิวหนังรอบ ๆ ตำแหน่งที่ใส่สาย ICD ไม่พบ Subcutaneous emphysema มีอาการเหนื่อยเล็กน้อยเมื่อทำกิจกรรม

สัญญาณชีพ: 
อุณหภูมิร่างกาย 37.2 องศาเซลเซียส อัตราชีพจร 82 ครั้งต่อนาที อัตราการหายใจ 22 ครั้งต่อนาที ความดันโลหิต 120/76 มิลลิเมตรปรอท ค่าความอิ่มตัวของออกซิเจนในเลือด (SaO2) 97% 

คำถาม: ท่านจะดูแลการระบายของ ICD ให้มีประสิทธิภาพในผู้ป่วยรายนี้ได้อย่างไร (จงอธิบายวัตถุประสงค์ของการทำ underwater sealed การดูแลการระบาย การประเมิน fluctuation การจัดท่านอน การกระตุ้นให้ผู้ป่วยบริหารการหายใจ และหากเกิดสายท่ออุดตัน ควรทำอย่างไร)

เฉลย: 
1.) หลักการ Underwater sealed มีวัตถุประสงค์เพื่อให้การระบายของ ICD เป็นระบบปิด (10) ป้องกันลมเข้าไปช่องเยื่อหุ้มปอด (10)
2.) การดูแลการระบาย สามารถทำได้โดย ดูแลสายท่อระบายไม่หักพับงอ (10)  ขวดรองรับสารเหลววางต่ำกว่าระดับทรวงอกของผู้ป่วยประมาณ 2-3 ฟุต (10)  หากสารเหลวในขวดรองรับมีปริมาณมาก ควรเปลี่ยนขวดรองรับสารเหลว (5)  และ เมื่อมีการเคลื่อนย้ายผู้ป่วยหรือเมื่อเปลี่ยนขวดรองรับสารเหลว ควร clamp สายท่อระบาย (10)
3.) การประเมิน fluctuation ของน้ำในหลอดแก้วยาวในขวดรองรับ เพื่อประเมินการอุดตันในระบบการระบายของ ICD (10) หรือประเมินตำแหน่งของสายท่อระบายว่าเหมาะสมหรือไม่ (10)
4.) ควรจัดท่านอนผู้ป่วยในท่า semi-Fowler’s position (5) หรือ Fowler’s position (5) หรือ Upright position (5)  หรือ ท่านอนศีรษะสูง (5)
5.) ควรกระตุ้นให้ผู้ป่วยบริหารการหายใจ (breathing exercise) (5)  โดยการหายใจเข้า-ออก ลึก ๆ (5)  หรือ Deep breathing exercise (5) หรือ ใช้ incentive spirometer (5) หากพบว่ามีลิ่มเลือด หรือเยื่อต่าง ๆ (fibrin) อุดตันในสายท่อระบาย ควรบีบและรูดสายท่อระบาย (10)  หรือ milking (5)  และ stripping สายท่อระบาย (5)

คำตอบ คะแนนเต็ม 100 คะแนน

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
ผู้ป่วยหญิงอายุ 18 ปี เล่นโทรศัพท์ขณะกำลังเดินเปลี่ยนห้องเรียน สะดุดหกล้ม ข้อเท้าพลิก ได้รับการรักษาโดยการใส่เฝือก (Short leg cast) ดังรูป หลังใส่เฝือกเสร็จแพทย์ให้กลับไปพักผ่อนที่บ้าน


คำถาม:
ขอให้ท่านให้คำแนะนำเรื่อง การดูแลเฝือก แก่ผู้ป่วยรายนี้ โดยให้ครอบคลุม หลังใส่เฝือกใหม่เมื่อเฝือกยังไม่แห้ง และเมื่อเฝือกแห้งแล้ว

เฉลย:
1.) หลีกเลี่ยงการวางเฝือกบนพื้นแข็งหรือวัตถุที่อาจทำให้เฝือกผิดรูป (5) หรือกดลงบนเฝือกขณะที่เฝือกยังไม่แห้ง (5)  ควรหาวัสดุที่อ่อนนุ่ม เช่น หมอน หรือผ้าห่มรองรับ (5) ไม่ใช้ผ้าห่ม/คลุม ขณะที่เฝือกยังไม่แห้ง เพราะจะทำให้เฝือกแห้งช้า (5)
2.) ยกส่วนที่มีเฝือกขึ้นสูงกว่าระดับหัวใจ (5) การยกอวัยวะที่ใส่เฝือกไว้สูงจะช่วยลดอาการบวมและเพิ่มการไหลเวียนของเลือด (5)
3.) อย่าใช้นิ้วหรือวัตถุแหลมแหย่เข้าไปในเฝือก (10) - หากมีอาการคันภายใน ควรหลีกเลี่ยงการใช้นิ้วหรือสิ่งของใด ๆ แหย่เข้าไป (5) เพราะอาจทำให้เกิดบาดแผลและติดเชื้อได้ (5)
4.) สังเกตอาการผิดปกติ ได้แก่
     -อาการเฝือกคับ ได้แก่ ปวดมาก ทาน/กินยาแก้ปวดแล้วไม่หาย แน่นคับ ชา ปลายนิ้วเท้าสีคล้ำ หรือสีซีด หากมีอาการเหล่านี้ให้รีบไปโรงพยาบเพื่อตัด/ขยายเฝือก (10)
    -ปวด มีหนองหรือสารคัดหลั่งผิดปกติ หรือมีกลิ่น ควรไปพบแพทย์ทันที เพราะอาจเกิดแผลและมีการติดเชื้อ (10)


5.) อย่ากดทับหรือเดินลงน้ำหนักบนเฝือก (5) อย่าลงน้ำหนักที่ขาที่ใส่เฝือก เว้นแต่ได้รับอนุญาตจากแพทย์ ควรใช้ไม้เท้า หรือไม้ค้ำเพื่อช่วยในการเดินและลดการกระแทกที่ขาที่บาดเจ็บ (10) อย่านอนทับขาที่ใส่เฝือก (5) หรือนั่งท่าที่ทำให้เฝือกได้รับแรงกด (5) เพราะจะทำให้รูปร่างของเฝือกเสียหาย (5)
6.) อย่าให้เฝือกโดนน้ำ (5)  - ควรคลุมเฝือกด้วยถุงพลาสติกหรือวัสดุกันน้ำหากจำเป็นต้องล้างมือหรือล้างขา และหลีกเลี่ยงการอาบน้ำโดยตรงบนเฝือก (5)
7.) รักษาความสะอาดของเฝือก (5) ไม่ขีดเขียนข้อความลงบนเฝือก หากมีฝุ่นหรือสกปรกทำความสะอาดภายนอกเบา ๆ (5)  
8.) ออกกำลังโดยการเกร็งกล้ามเนื้อ (5) ขยับข้อที่สามารถขยับได้ทั้ง 2 ข้าง เพื่อป้องกันกล้ามเนื้อลีบและอ่อนแรง ฟื้นฟูได้เร็วขึ้น (5)

คำตอบ คะแนนเต็ม 100 คะแนน

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