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
        fileUrl = await uploadToSpaces(finalFilePath, `surgical/lab1/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        fileUrl = await uploadToSpaces(finalFilePath, `surgical/lab2/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        fileUrl = await uploadToSpaces(finalFilePath, `surgical/lab3/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        fileUrl = await uploadToSpaces(finalFilePath, `surgical/lab4/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        fileUrl = await uploadToSpaces(finalFilePath, `surgical/lab5/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
router.post('/medical/1', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `medical/lab1/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        const feedbackJson = await processTranscriptionMedicalLab1(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 1,
            subject: 'medical',
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

async function processTranscriptionMedicalLab1(transcription) {
    const answerKey = `
คำถาม:
ผู้ป่วยที่มีภาวะ Respiratory failure ได้รับการรักษาโดยการ on ET-tube with carina’s ventilator ในขณะที่ตรวจเยี่ยมผู้ป่วยพบว่ามีเสียงหายใจครืดคราด  ให้นักศึกษาอธิบายขั้นตอนการดูดเสมหะและแสดงการดูดเสมหะกับหุ่นจำลอง

เฉลย:
แจ้งให้ผู้ป่วยทราบ  (5)
จัดท่านอนศีรษะสูง 30-45 องศา (10)
ล้างมือแบบ hygienic hand washing  (15)
สวมถุงมือ  (5) 
สวมหน้ากากอนามัย   (5)
ดูดเสมหะในท่อช่วยหายใจโดยใช้เวลาครั้งละ 10  ถึง 15 วินาที (15)
ดูดเสมหะโดยยึดหลักปราศจากเชื้อ หรือ aseptic technique  (15)
ดูดเสมหะโดยใช้ความดัน 80 ถึง 120 มิลลิเมตรปรอท (15)
ให้ออกซิเจนก่อน ขณะ และหลังดูดเสมหะ  (15)
บันทึกผลการดูดเสมหะ (5)

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

router.post('/medical/2', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `medical/lab2/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        const feedbackJson = await processTranscriptionMedicalLab2(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 2,
            subject: 'medical',
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

async function processTranscriptionMedicalLab2(transcription) {
    const answerKey = `
คำถาม:
ผู้ป่วยโรคหลอดเลือดสมองที่มีค่า Glasgow Coma Scale เท่ากับ  E1V2M3  ให้นักศึกษาอธิบายความหมายของ E1    V2  และ M3   และแสดงท่าทางประกอบ

เฉลย:
แบบประเมินกลาสโกว์โคมาสกอร์ (Glasgow Coma Score [GCS]) เป็นแบบประเมินที่ใช้ในการประเมินระดับความรู้สึกตัวในผู้ป่วยบาดเจ็บศีรษะ  โดยประเมินแบ่งออกเป็น 3 ข้อ คือ การลืมตา (eye opening) ซึ่งประเมินหน้าที่ของศูนย์ควบคุมระดับความรู้สึกตัว (reticular activating system: RAS) การสื่อภาษา (verbal response) ซึ่งประเมินหน้าที่ของศูนย์ควบคุมการพูด (speech center) และ การเคลื่อนไหว (motor response) ซึ่งประเมินหน้าที่ของเปลือกสมอง (cerebral cortex) (20)
การประเมินนี้ใช้สำหรับการประเมินทางระบบประสาทในผู้ป่วย ต่อไปนี้  (10)
1. ผู้ป่วยบาดเจ็บที่ศีรษะ 
2. ผู้ป่วยที่มีกลุ่มอาการทางสมอง เช่น ผู้ป่วยโรคหลอดเลือดสมอง   
3. ผู้ป่วยก่อนและหลังการผ่าตัดสมอง 
4. กลุ่มโรค/ กลุ่มอาการตามแผนการรักษาของแพทย์ 
ผู้ป่วยมี E1V2M3 หมายความดังรายละเอียดนี้
1. แสดง หลับตา แล้วอธิบายว่า ผู้ป่วยไม่ลืมตาเลย แม้ถูกกระตุ้นด้วยความเจ็บปวด หมายถึง E1 อ่านว่าอีหนึ่ง (30) 
2. แสดง ส่งเสียงไม่เป็นคำพูด เช่น เสียงอืออา เสียงคราง หมายถึง V2 อ่านว่า  วีสอง (30)
3. แสดง ขาเกร็งเหยียดตรง ปลายแขนหมุนเข้าหาลำตัวรูป คล้ายตัว C เรียกลักษณะนี้ว่า Decorticate rigidity มายถึง M3 อ่านว่าเอ็มสาม (30)

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

router.post('/medical/3', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `medical/lab3/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        const feedbackJson = await processTranscriptionMedicalLab3(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 3,
            subject: 'medical',
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

async function processTranscriptionMedicalLab3(transcription) {
    const answerKey = `
คำถาม:
ผู้ป่วยโรคปอดอักเสบรายหนึ่ง on Oxygen cannula 3 LPM มีอาการหายใจเหนื่อยหอบ ฟังปอดพบเสียง rhonchi and wheezing แพทย์มีแผนการรักษาให้พ่นยา Berodual 1 NB stat via Nebulizer  หลังจากตรวจสอบชื่อ นามสกุล และการแพ้ยาแล้ว  
ให้นักศึกษาอธิบายวิธีการพ่นยาและการให้คำแนะนำกับผู้ป่วยรายนี้  

เฉลย:
1. จะขอหมุนหัวเตียงขึ้น พร้อมแสดงท่าทางหมุนหัวเตียงสูง (5)
2. แสดงท่าทาง ประกอบหน้ากากพ่นยา ต่อสายออกซิเจนเข้ากับหน้ากาก ใส่ยาพ่นลงในกระเปาะยาและหมุนกระเปาะปิดเกลียวให้แน่น (15)
3. แสดงท่าทาง ปลดเครื่องทำความชื้น (humidifier) ออกต่อปลายสายพ่นยาเข้ากับ flow meter (15)
4. แสดงท่าทาง หมุนปุ่ม flow meter ไปที่ 6 – 8 ลิตรต่อนาที (15)
5. ครอบหน้ากากพ่นยากับใบหน้าผู้ป่วยให้แนบสนิท และปรับกระบอกยาให้อยู่ในแนวตั้ง 90 องศา (10) และ ให้ผู้ป่วยหายใจเข้าออกทางจมูกให้ลึก ๆ (10)
6. แจ้งผู้ป่วยว่าถ้ามีอาการใจสั่น ชีพจรเร็ว อาการหายใจเหนื่อยหอบ ให้แจ้งให้พยาบาลทราบ (10)
7. บอกว่าเมื่อยาหมด ปิดออกซิเจน (5) แล้ว ถอดหน้ากากพ่นยาออกจากใบหน้าผู้ป่วย (5)
8. ดูแลให้ออกซิเจนตามแผนการรักษา (10)
9. ให้ผู้ป่วยบ้วนปาก และจิบน้ำ  (10)

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

router.post('/medical/4', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `medical/lab4/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        const feedbackJson = await processTranscriptionMedicalLab4(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 4,
            subject: 'medical',
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

async function processTranscriptionMedicalLab4(transcription) {
    const answerKey = `
คำถาม:
ผู้ป่วยเบาหวานแพทย์มีแผนการรักษาให้เจาะ capillary blood glucose ก่อนอาหารและให้ insulin ตาม RI scale ผลการเจาะพบว่าระดับน้ำตาลในเลือดสูงต้องให้ Actapid 8 units SC  ให้นักศึกษาอธิบายและแสดงการให้ยากับผู้ป่วย

เฉลย:
1. ตรวจสอบชนิดของยากับแผนการรักษาของแพทย์ (5)
	2. เตรียมยาโดยดูดจำนวนยาตามแผนการรักษา โดยเช็ดทำความสะอาดบริเวณจุกยางด้วยสำลีชุบ 70% alcohol (10) ก่อนแทงเข็ม ดูดยาเท่ากับ 8 units (5) และสวมปลอกเข็มหลังจากดูดยาเสร็จ ก่อนนำไปฉีด (5)
	3. ตรวจสอบชื่อ และนามสกุลผู้ป่วย (10) และแจ้งผู้ป่วยว่าจะฉีดยาอะไร (5) เพื่ออะไร (5)
	4. เลือกตำแหน่งฉีดยาได้ (บริเวณหน้าท้อง หรือ ต้นขา หรือ ต้นแขนด้านนอก) (15)
	5. เช็ดทำความสะอาดบริเวณที่จะฉีดด้วยสำลีชุบ 70% alcohol (5)
	6. ใช้มือข้างที่ไม่ถนัดยกผิวหนังบริเวณที่จะฉีด (5)
	7. แทงเข็มเข้าใต้ผิวหนัง ต้องทำมุม 60 กรณีบริเวณต้นขา (5) หรือ ต้นแขนด้านนอก (5) หรือ 90 องศา บริเวณหน้าท้อง (5)
	8. ทดสอบว่ายาไม่ได้อยู่ในหลอดเลือดโดยการดูดขึ้นมา (5)
	9. กดก้านสูบดันยาจนหมด (5) และถอนเข็มออก (5) ใช้สำลีกดและห้ามคลึง (5)

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

router.post('/medical/5', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `medical/lab5/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        const feedbackJson = await processTranscriptionMedicalLab5(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 5,
            subject: 'medical',
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

async function processTranscriptionMedicalLab5(transcription) {
    const answerKey = `
คำถาม:
ผู้ป่วยโรคมะเร็งเม็ดเลือดขาวรายหนึ่ง ผู้ป่วยมีภาวะซีด และผลตรวจ hemoglobin เท่ากับ  6.0 gm%  แพทย์มีแผนการรักษาให้ Leucocyte poor red blood cells (LPRC) 1 unit หลังจากติดตามเลือดมาให้ผู้ป่วยได้  ให้นักศึกษาอธิบายวิธีการพยาบาลผู้ป่วยที่ได้รับเลือด

เฉลย:
1. ตรวจสอบความถูกต้องของถุงเลือด ใบคล้องเลือด และใบนำส่งเลือดให้ตรงกันทุกจุด ได้แก่ ชื่อ-นามสกุล (5) เลขที่โรงพยาบาล ชนิดของเลือด (5) หมู่เลือด Rh (5) หมายเลขถุงเลือด (5) และปริมาณ รวมทั้งตรวจสอบวันหมดอายุ (5) และลักษณะของเลือด โดยพยาบาล 2 คน (5)
	2. เตรียม set ให้เลือดที่มีตัวกรอง (5)
	3. ถามชื่อ นามสกุลและหมู่เลือดของผู้ป่วย (5)
	4. ขอดูป้ายข้อมือเพื่อเช็คชื่อ นามสกุลให้ตรงกัน (5)
	5. อธิบายว่าหากขณะให้เลือดมีอาการเหนื่อยหอบ มีไข้ หนาวสั่น ผื่นคัน แน่นหน้าอก ปวดหลัง ให้แจ้งให้พยาบาลทราบ (15)
	6. วัดความดันโลหิต ชีพจร อุณหภูมิ และอัตราการหายใจ ก่อนให้เลือด (15)
	7. ดูแลการให้เลือดโดยต่อเลือดให้กับผู้ป่วย (5)
	8. หลังจากได้เลือด 15 นาที วัดความดันโลหิต ชีพจร อุณหภูมิ และอัตราการหายใจ (10) และสอบถามอาการ เหนื่อยหอบ มีไข้ หนาวสั่น ผื่นคัน แน่นหน้าอก ปวดหลัง (10)
	9. หากไม่พบอาการผิดปกติ ปรับการไหลของเลือด/ส่วนประกอบของเลือดตามแผนการรักษา (PRC ต้องให้หมดภายใน 4 ชั่วโมง) (10)
	10. วัดความดันโลหิต ชีพจร อุณหภูมิ และอัตราการหายใจ หลังเลือดหมด (10)

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
OB NURSING
*/
router.post('/ob/1', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `ob/lab1/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        const feedbackJson = await processTranscriptionOBLab1(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 1,
            subject: 'ob',
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

async function processTranscriptionOBLab1(transcription) {
    const answerKey = `
Initial Prenatal Assessment (เฉลย)
1. อธิบายผลการตรวจปัสสาวะ เฉลย (15 คะแนน) 
ผลการตรวจปัสสาวะปกติ ไม่มีโปรตีน (protein) และน้ำตาล (sugar) ในปัสสาวะ 
หรือ
•	 ผลการตรวจปัสสาวะไม่พบโปรตีน 
•	ผลการตรวจปัสสาวะไม่พบน้ำตาล 
•	Urine protein ให้ผลลบ แสดงว่าไม่มีโปรตีนในปัสสาวะ 
•	ค่าโปรตีนในปัสสาวะให้ผลลบ แสดงว่าไม่มีโปรตีนในปัสสาวะ 
•	Urine sugar ให้ผลลบ แสดงว่าไม่มีน้ำตาลในปัสสาวะ 
•	ค่าน้ำตาลในปัสสาวะให้ผลลบ แสดงว่าไม่มีโปรตีนในปัสสาวะ 
•	ผลตรวจปัสสาวะปกติ 

2. อธิบายผลการตรวจเลือด เฉลย (15 คะแนน) 
1.	ค่าความเข้มข้นของเลือด ฮีโมโกลบิน (Hb) มีค่าต่ำกว่าปกติ และ ฮีมาโตคริต (Hct) มีค่าต่ำกว่าปกติ หรือ ค่า MCV เท่ากับ 68 fl แปลผล มีค่าต่ำกว่าปกติ หรือ ภาวะโลหิตจาง หรือ มีภาวะเลือดจาง
2.	มีโอกาสเป็นธาลัสซีเมีย หรือ ผลการคัดกรองธาลัสซีเมียผิดปกติ มีโอกาสเป็นธาลัสซีเมีย (thalassemia) หรือ ไม่พบความผิดปกติของฮีโมโกลบินอี (HbE) ไม่มีภาวะธาลัสซีเมียที่เกี่ยวข้องกับ ฮีโมโกลบินอี (HbE) หรือ ไม่เป็นธาลัสซีเมียชนิด ฮีโมโกลบิน อี (hemoglobin E)

4. อธิบายผลการตรวจคัดกรองดาวน์ซินโดรม เฉลย (15 คะแนน)
ผลการตรวจคัดกรอง Down’s Syndrome 1:500  หรือ มีโอกาสน้อยที่ทารกในครรภ์จะมีภาวะดาวน์ซินโดรม หรือ ทารกในครรภ์มีความเสี่ยงต่ำที่จะเกิดภาวะดาวน์ซินโดรม 
 
3. อธิบายสาเหตุและคำแนะนำในการปฏิบัติตัวเมื่อมีอาการคลื่นไส้อาเจียน  เฉลย (30 คะแนน) 
	สาเหตุ เฉลย (10 คะแนน)
•	คลื่นไส้อาเจียน หรือ morning sickness หรือ nausea gravidarum เกิดจากการเพิ่มขึ้นของฮอร์โมน hCG (human chorionic gonadotropin) และ เอสโตรเจน (estrogen) 
•	คลื่นไส้อาเจียน เกิดจากการเพิ่มขึ้นของฮอร์โมนที่เกี่ยวกับการตั้งครรภ์ (5 คะแนน)
•	คลื่นไส้อาเจียน เกิดจากการเปลี่ยนแปลงฮอร์โมนที่เกี่ยวกับการตั้งครรภ์ (5 คะแนน)
การปฏิบัติตัวเมื่อมีคลื่นไส้อาเจียน เฉลย (20 คะแนน)
•	รับประทานอาหารครั้งละน้อยแต่บ่อยครั้ง 
•	เพิ่มจำนวนมื้ออาหารเป็นวันละ 5-6 มื้อ 
•	รับประทานอาหารย่อยง่าย เช่น ขนมปังกรอบ (หลีกเลี่ยงอาหารรสจัด อาหารมัน อาหารที่มีกลิ่นฉุน 
•	จิบน้ำบ่อยๆ หรือดื่มน้ำผลไม้หรือน้ำขิง 
•	หลังอาเจียน ให้บ้วนปากเพื่อลดการกระตุ้นทำให้คลื่นไส้อาเจียน และทำให้ช่องปากสะอาดป้องกันฟันผุ 

4. อธิบายสาเหตุและคำแนะนำในการปฏิบัติตัวเมื่อมีเลือดออกตามไรฟัน เฉลย (30 คะแนน)
	สาเหตุ เฉลย (10 คะแนน)
•	เลือดออกตามไรฟัน เกิดจากฮอร์โมนเอสโตรเจน (estrogen) ที่เพิ่มขึ้นในขณะตั้งครรภ์ ทำให้เลือดมาเลี้ยงบริเวณช่องปากและเหงือกมากขึ้น ส่งผลให้สตรีตั้งครรภ์มีเหงือกบวมนุ่มจากการมีเลือดคั่งและมีเลือดออกง่าย 
การปฏิบัติตัวเมื่อมีเลือดออกตามไรฟัน เฉลย (20 คะแนน)
•	ใช้แปรงสีฟันที่มีขนแปรงอ่อนนุ่ม 
•	หลีกเลี่ยงการแปรงฟันแรงเกินไป 
•	รับประทานอาหารที่มีวิตามินซีสูง เช่น ส้ม ฝรั่ง มะละกอ และผักใบเขียว 
•	ถ้ามีอาการมาก ควรไปตรวจสุขภาพช่องปากกับทันตแพทย์ในระหว่างตั้งครรภ์ 

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

router.post('/ob/2', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `ob/lab2/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        const feedbackJson = await processTranscriptionOBLab2(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 2,
            subject: 'ob',
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

async function processTranscriptionOBLab2(transcription) {
    const answerKey = `
การตรวจครรภ์ (ปวดหลังและตะคริว) (เฉลย)

เฉลย
1. อธิบายวัตถุประสงค์ของการตรวจครรภ์
เฉลย (30 คะแนน) 
•	เพื่อเปรียบเทียบความสูงของยอดมดลูกกับอายุครรภ์ (5 คะแนน)
•	เพื่อหาความสัมพันธ์ระหว่างส่วนสูงยอดมดลูก (fundal height) และอายุครรภ์ (date) (10 คะแนน)
•	เพื่อประเมิน size และ date (5 คะแนน)
•	เพื่อประเมินการเจริญเติบโตของทารกในครรภ์ (fetal growth) (5 คะแนน)
•	เพื่อคาดคะเนอายุครรภ์และกำหนดวันคลอด (10 คะแนน)
•	เพื่อวินิจฉัยสภาพของทารกในครรภ์ (5 คะแนน)
•	เพื่อประเมินสภาวะทารกในครรภ์ (5 คะแนน)
•	เพื่อประเมินแนวลำตัว ส่วนนำ ทรง และท่าทารกในครรภ์ (5 คะแนน)
•	เพื่อใช้เป็นข้อมูลสำหรับวางแผนให้การพยาบาล (5 คะแนน)
•	เพื่อประเมินการมีชีวิตของทารกในครรภ์ (5 คะแนน)

2. อธิบายผลการตรวจครรภ์และสาธิตการตรวจครรภ์ตามสถานการณ์ที่กำหนด
เฉลย  (70 คะแนน)
1. การดู (10 คะแนน)
1.1 หน้าท้องเป็น ovoid shape, longitudinal lie, fundal height สูงกว่าสะดือ 2/4 พบการเคลื่อน ไหวด้านซ้ายค่อนมาข้างหน้า (5 คะแนน)
1.2 หน้าท้องมีขนาดใหญ่ขึ้น fundal height เท่ากับ 27 เซนติเมตร ขนาดหน้าท้องสัมพันธ์กับอายุครรภ์ (5 คะแนน)
2. การคลำ (40 คะแนน)
2.1 ยอดมดลูก (fundal height) อยู่ระดับ 2/4 สูงกว่าสะดือ (5 คะแนน)
2.2 ยอดมดลูกมีลักษณะนุ่ม กว้าง ไม่มี ballottement (5 คะแนน)
2.3 ยอดมดลูกเป็นส่วนก้นของทารก (10 คะแนน)
2.4 พบลักษณะแผ่นเรียบ (large part) ด้านขวาของสตรีตั้งครรภ์ และลักษณะไม่เรียบ ขรุขระ (small part) ที่ด้านซ้ายของสตรีตั้งครรภ์ (10 คะแนน)
2.5 ด้านหลังของทารกอยู่ทางด้านขวาของสตรีตั้งครรภ์ และแขนขาของทารกอยู่ทางด้านซ้ายหน้าของสตรีตั้งครรภ์ (10 คะแนน)
2.6 ส่วนนำของทารกกลม แข็ง เรียบ สามารถโยกคอนส่วนนำไปมาระหว่าง ilia fossa ได้ (10 คะแนน)
2.7 ส่วนนำเป็นศีรษะ ลอยอยู่ (head float) เหนือหัวหน่าว (10 คะแนน)
2.8 ส่วนนำยังไม่มี engagement (5 คะแนน)
2.9 ส่วนนำยังไม่เข้าสู่อุ้งเชิงกราน (5 คะแนน)
2.10 ศีรษะของทารกอยู่ด้านล่าง สามารถขยับได้เล็กน้อย (5 คะแนน)
2.11 ศีรษะของทารกอยู่ในท่าหันหลังด้านขวาของสตรีตั้งครรภ์ (10 คะแนน)
2.12 ทารกอยู่ในท่า ROP (10 คะแนน)
3. การฟัง (20 คะแนน)
3.1 ฟังเสียงการเต้นของหัวใจทารก (fetal heart sound) ได้บริเวณสีข้างด้านขวาของสตรีตั้งครรภ์ (10 คะแนน)
3.2 อัตราการเต้นของหัวใจทารกในครรภ์ เป็นจังหวะสม่ำเสมอ 138-156 ครั้งต่อนาที (5 คะแนน)
3.3 funic souffle มีเสียงฟู่ จังหวะสม่ำเสมอ เท่ากับเสียงการเต้นของหัวใจทารก (5 คะแนน)
3.4 ได้ยินเสียง bowel sound สม่ำเสมอ ประมาณ 16 ครั้งต่อนาที (5 คะแนน)
3.5 ได้ยินเสียง bowel sound สม่ำเสมอ อยู่ในเกณฑ์ปกติ (5 คะแนน)

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

router.post('/ob/3', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `ob/lab3/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        const feedbackJson = await processTranscriptionOBLab3(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 3,
            subject: 'ob',
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

async function processTranscriptionOBLab3(transcription) {
    const answerKey = `

คำแนะนำการบริหารร่างกายในระยะตั้งครรภ์ และเฉลย

เฉลย
1.	ท่านจะซักประวัติผู้คลอดรายนี้ในประเด็นใด และดูข้อมูลสำคัญอะไรจากสมุดฝากครรภ์บ้าง
เฉลย (70 คะแนน)
•	1. การซักประวัติ เมื่อผู้คลอดเข้ามาในหน่วยคลอด พยาบาลผดุงครรภ์ควรซักประวัติ รวบรวมข้อมูลจากสมุดฝากครรภ์ ดังนี้
1.1	อาการที่นำมาโรงพยาบาล สอบถามสาเหตุของการตัดสินใจมาโรงพยาบาลของผู้คลอด ได้แก่ อาการ/ลักษณะของการเจ็บครรภ์ เพื่อพิจารณาแยกระหว่างการเจ็บครรภ์จริง กับเจ็บครรภ์เตือน มูกเลือด ถุงน้ำคร่ำแตก เด็กดิ้น ดังรายละเอียดนี้ (10 คะแนน)
1.1.1 หากผู้คลอดมีอาการเจ็บครรภ์ควรซักถามเกี่ยวกับลักษณะ ตำแหน่งอาการที่เจ็บ 
ระยะเวลาที่เริ่มเจ็บ ความถี่ (frequency) ระยะเวลาการเจ็บในแต่ละครั้ง (duration) อาการเจ็บนั้นร้าวไปที่ใดหรือไม่ หากนอนพัก อาการเหล่านั้นหายไปหรือไม่  (10 คะแนน)
ลักษณะ: การหดรัดตัวของมดลูก
เจ็บครรภ์เตือน
- มดลูกจะเริ่มมีการหดรัดตัว และการหดรัดตัวไม่สม่ำเสมอ
- ผู้คลอดรู้สึกปวดบริเวณท้อง หรือปวดบริเวณเหนือสะดือ
- มดลูกหยุดหดรักตัวได้ ถ้าได้พักหรือหลับ
- ระยะเวลาในการหดรัดตัวแต่ละครั้ง ความถี่ หรือ ความแรง ของการหดรัดตัวใหม่เพิ่มขึ้น
เจ็บครรภ์จริง
- มดลูกจะเริ่มหดรัดตัว ช่วงต้นอาจไม่สม่ำเสมอ แต่การหดรัดตัวจะถี่ขึ้นและสม่ำเสมอมากขึ้น รวมทั้งสามารถคาดเดาได้ว่าจะหดรัดตัวอีกครั้งเมื่อใด 
- ผู้คลอดจะรู้สึกปวดหลัง มีอาการร้าวลงไปที่หน้าท้องส่วนล่าง หรือร้าวลงไปที่ขา
- แต่ละครั้งของการหดรัดตัว ระยะเวลาในการหดรัดตัวแต่ละครั้ง ความถี่ ความแรงจะมีการเพิ่มขึ้น

ลักษณะ: ปากมดลูก
เจ็บครรภ์เตือน
- อาจพบภาวะปากมดลูกนุ่ม แต่จะไม่พบการบางตัว การเปิดของปากมดลูก
เจ็บครรภ์จริง
- ปากมดลูกมีการบางตัว (Effacement) และปากมดลูกเปิด (dilatation) และพบการมีมูกหรือมูกเลือดออกจากปากมดลูก
			1.1.2 ประเมินการแตกของถุงน้ำคร่ำ กรณีผู้คลอดมีการแตกของถุงน้ำคร่ำ ควรสอบถามเวลาที่ถุงน้ำคร่ำแตก ลักษณะ กลิ่น สี และปริมาณของน้ำคร่ำที่ออกมา กรณีถุงน้ำคร่ำยังไม่แตกให้บันทึกสถานะของถุงน้ำคร่ำด้วยเช่นกัน (10 คะแนน)
			1.1.3 การดิ้นของทารกในครรภ์ ควรซักถามผู้คลอดเกี่ยวกับลูกดิ้น ว่าปกติ หรือไม่ เพื่อประเมินภาวะสุขภาพของทารกในครรภ์ (5 คะแนน)
1.2 ซักประวัติข้อมูลส่วนตัว ได้แก่ อายุ ระดับการศึกษา สถานภาพสมรส อาชีพ น้ำหนัก ความสูง จำนวนครั้งของการตั้งครรภ์ (5 คะแนน)
1.2.1 อายุ เพื่อประเมิน ความต้องการการช่วยเหลือ ความเสี่ยงในระยะคลอด 
1.2.2 น้ำหนัก โดยพิจารณาน้ำหนักที่เพิ่มขึ้นตลอดระยะการตั้งครรภ์ เพื่อประเมิน ความเสี่ยงการคลอดยากหรือการคลอดติดขัด
1.2.3 ความสูง ผู้คลอดที่มีส่วนสูงน้อยกว่า 145 เซนติเมตร เสี่ยงต่อการเกิดภาวะ CPD
1.2.4 จำนวนครั้งของการตั้งครรภ์ เพื่อประเมินระยะเวลาในการคลอด กรณีที่เป็นครรภ์หลัง จะใช้
ระยะเวลาในการคลอดน้อยกว่าครรภ์แรก 
1.2	ตรวจสอบกำหนดการคลอด (EDC) เพื่อพิจารณาอายุครรภ์ ควรสอบถามอายุครรภ์ หรือ ดูข้อมูลจากสมุดฝากครรภ์ ว่าครบกำหนดการคลอดหรือไม่ หากอายุครรภ์น้อยกว่า 37 สัปดาห์ จะเพิ่มความเสี่ยง birth asphyxia หรือ หากอายุครรภ์มากกว่า 41 สัปดาห์ จะเพิ่มความเสี่ยงต่อการเกิด meconium aspiration (10 คะแนน)
1.3	ดูผลตรวจทางห้องปฏิบัติการ เช่น ค่าฮีโมโกลบิน ผลตรวจธาลัสซีเมีย (5 คะแนน)
1.4 ประวัติการตั้งครรภ์ ได้แก่ จำนวนครั้งที่มาฝากครรภ์ในครรภ์ปัจจุบัน กรณีผู้คลอด มาฝากครรภ์จำนวนน้อยครั้งกว่าการฝากครรภ์ตามเกณฑ์คุณภาพ มักมีโอกาสเกิดภาวะเสี่ยงในระยะตั้งครรภ์ เช่น ทารกน้ำหนักมากหรือน้อยกว่าเกณฑ์ ภาวะความดันโลหิตสูงขณะตั้งครรภ์ ภาวะเบาหวานในระยะตั้งครรภ์ เป็นต้น (5 คะแนน)
1.5 ประวัติการคลอดในอดีต ควรประเมินว่า มีประวัติการคลอดก่อนกำหนด การใช้สูติศาสตร์หัตถการช่วยคลอด เช่น คีม เครื่องดูดสุญญากาศ ผ่าตัดคลอด หรือภาวะแทรกซ้อนอื่นๆในระยะตั้งครรภ์ คลอด และหลังคลอด เช่น ภาวะเบาหวานในระยะตั้งครรภ์ ภาวะความดันโลหิตสูง ภาวะตกเลือดในระยะคลอดหรือหลังคลอด ภาวะรกค้าง ล้วงรก น้ำหนักของทารกแรกคลอดโดยเฉพาะในรายที่มีน้ำหนักตัวมากกว่า 4000 กรัม สุขภาพของทารกปัจจุบัน กรณีภาวะแท้ง ให้ซักถามเรื่องประวัติการขูดมดลูกด้วย เนื่องจากหากมีประวัติ เคยขูดมดลูก อาจเกิดภาวะรกฝังตัวลึกได้ ไหนครรภ์ปัจจุบัน (5 คะแนน)
1.6 ประวัติการเจ็บป่วยในครรภ์ปัจจุบัน และในครรภ์ที่ผ่านมา ภาวะแทรกซ้อนทางอายุรกรรม หรือโรค
ในทางระบบสืบพันธุ์เช่น โรคเบาหวาน ความดันโลหิตสูง โรคหัวใจโรคเลือด โรคติดเชื้อทางเพศสัมพันธ์ อุบัติเหตุที่มีผลกระทบต่อกระดูกเชิงกราน เป็นต้น (5 คะแนน)
		1.7 ประวัติด้านจิตสังคม ซักถามเกี่ยวกับประสบการณ์การคลอดในครรภ์ที่ผ่านมา ความพร้อมในการตั้งครรภ์ ความคาดหวังต่อเพศของทารก สัมพันธภาพภายในครอบครัว แหล่งสนับสนุนในการดูแลทารกแรกเกิด (5 คะแนน)
•	2. การตรวจร่างกายทั่วไป ได้แก่ ลักษณะรูปร่างทั่วไป สัญญาณชีพ น้ำหนักตัว พฤติกรรมการแสดงออกของ
การตั้งครรภ์
2.1 ลักษณะรูปร่างทั่วไป ได้แก่ ท่าทางลักษณะการเดินที่ผิดปกติ ซึ่งอาจเกิดจากกระดูกเชิงกรานที่ผิดปกติได้ 
ส่วนสูงโดยเฉพาะในรายที่สูงน้อยกว่า 145 เซนติเมตร อาจมีภาวะช่องเชิงการแคบได้ นอกจากนี้ ควรประเมินสภาพทั่วไปของหญิงตั้งครรภ์ เช่น อาการบวม อาการซีด อาการหายใจหอบ เป็นต้น
2.2 สัญญาณชีพ ประเมินความดันโลหิต อุณหภูมิร่างกาย อัตราการหายใจ และอัตราการเต้นของชีพจร กรณีตรวจพบ ความดันโลหิตสูงกว่าปกติ ควรให้ผู้คลอดนอนพักสัก 15 นาที แล้วจึงวัดซ้ำอีกครั้ง ควรวัดในช่วงที่มดลูกคลายตัว และให้ผู้คลอดนอนตะแคงเพื่อป้องกันมดลูกกดทับ ซึ่งอาจเกิดภาวะ fetal distress ได้
2.3 พฤติกรรมการแสดงออกของการเจ็บครรภ์ โดยประเมินว่าสอดคล้องกับการเปิดของปากมดลูกหรือไม่ อาการแสดงของการเจ็บขัง จะมีลักษณะหายใจเร็ว เกร็งตัวโดยเฉพาะในระยะช่วงมดลูกมีการหดรับตัว กระสับกระส่ายบิดตัวไปมา

2.	ท่านจะพิจารณารับผู้คลอดรายนี้ไว้ในโรงพยาบาลหรือไม่ พร้อมอธิบายเหตุผล 
เฉลย (30 คะแนน) 
•	รับไว้ในโรงพยาบาล (15 คะแนน) 
เนื่องจาก
•	ผู้คลอดมีอาการเจ็บครรภ์จริง
1.	ปวดหน่วงหัวหน่าว หน้าท้องร้าวไปที่หลัง Interval 3 นาที 10 วินาที Duration 45 วินาที Intensity Moderate (10 คะแนน)
2.	มีมูกเลือดออกทางช่องคลอด (10 คะแนน)
3.	Cervix dilated 2 cm. Effacement 75% Membrane intact Station -3 (10 คะแนน)

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

router.post('/ob/4', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `ob/lab4/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        const feedbackJson = await processTranscriptionOBLab4(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 4,
            subject: 'ob',
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

async function processTranscriptionOBLab4(transcription) {
    const answerKey = `
    
การดูแลในระยะที่ 1 ของการคลอด (ระยะคลอด) และเฉลย

เฉลย
1.	ท่านจะประเมินผู้คลอดในด้านใดบ้าง และจะให้การพยาบาลในผู้คลอดรายนี้อย่างไร เฉลย (50 คะแนน)
	ประเมินความเจ็บปวด: สอบถามระดับความเจ็บปวดของมารดา สังเกตอาการทางกาย เช่น การขยับตัว การแสดงออกทางสีหน้า (10 คะแนน)
	ประเมินสภาวะของผู้คลอดและสุขภาพของทารกในครรภ์: ตรวจสอบสัญญาณชีพของมารดาและทารกอย่างสม่ำเสมอ (10 คะแนน)
	ประเมินความก้าวหน้าของการคลอด เช่น การหดรัดตัวของมดลูก การเปิดของปากมดลูก (10 คะแนน)
	ประเมินเสียงหัวใจทารก เช่น ดูรูปแบบการเกิด pattern เสียงหัวใจทารกร่วมกับการหดรัดตัวของมดลูก (10 คะแนน)
	ให้ข้อมูลเกี่ยวกับความก้าวหน้าของการคลอดหรือ กระบวนการคลอด เช่น การเปิดของปากมดลูก ผลบวกของการเจ็บครรภ์คลอด ความก้าวหน้าของการคลอด ระยะเวลาของการคลอด แนวทางการรักษา การปฏิบัติตนในระยะคลอด เป็นต้น ความกลัวส่วนใหญ่มักเกิดจากความไม่รู้ ความเข้าใจที่ไม่ถูกต้องเกี่ยวกับกระบวนการคลอด ทำให้ผู้คลอดมีความวิตกกังวลและกลัวเกิดความตึงเครียดทางกายและใจ ส่งผลให้กล้ามเนื้อต่างๆ รวมทั้งมดลูกตึงเครียดไปด้วย มีผลให้การถ่างขยายของปากมดลูกล่าช้า ดังนั้น การให้ความรู้ที่ถูกต้องเกี่ยวกับกระบวนการคลอด จึงเป็นการตัดวงจรกลัว ตึงเครียด เจ็บปวด โดยลดสัญญาณความปวดที่จะส่งไปยังสมอง หรือเป็นการเปลี่ยนแปลงการรับรู้ของผู้คลอดในระยะคลอด (10 คะแนน) 
	การประคับประคองทางด้านจิตใจ สนับสนุน สามี ของผู้คลอดหรือญาติที่อยู่เป็นเพื่อน ให้สามารถประคับประคองจิตใจผู้คลอด อยู่เป็นเพื่อน ให้กำลังใจ และไม่ปล่อยให้ผู้คลอดเผชิญกับการคลอดตามลำพัง และที่สำคัญที่สุด คือ พยาบาลต้องมีความเข้าอกเข้าใจถึงความต้องการของผู้คลอดเป็นอย่างดี (10 คะแนน)
	หากความเจ็บปวดรุนแรงมาก: ควรรายงานแพทย์เพื่อพิจารณาการให้ยาแก้ปวด (10 คะแนน)
 
2.	ท่านจะอธิบายวิธีบรรเทาความเจ็บปวดในระยะรอคลอดโดยไม่ใช้ยาขณะที่มี labor pain ให้แก่ผู้คลอดรายนี้อย่างไร เช่น การหายใจ การเพ่งจุดสนใจ การลูบหน้าท้อง เฉลย (50 คะแนน)
	การเพ่งความสนใจหรือมุ่งความสนใจไปที่จุดใดจุดหนึ่ง: จากแนวความคิดนี้ ลามาช (Lamaze) สูติแพทย์ชาวฝรั่งเศส เป็นผู้เสนอแนวคิดเกี่ยวกับการลดหรือบรรเทาความปวด ด้วยวิธีจิตป้องกันหรือควบคุมจิตใจ (psychoprophyloxis) โดยให้ผู้คลอดมุ่งความสนใจไปยังจุดใดจุดหนึ่ง ในขณะที่มดลูกหดรัดตัว โดยเพ่งของชิ้นเล็กๆ เช่น ภาพหรือแจกันดอกไม้ จินตนาการถึงสถานที่ที่สงบ หรือสิ่งที่ทำให้รู้สึกผ่อนคลาย  นับเลขทีละหนึ่งอย่างช้าๆ เพื่อเบี่ยงเบนความสนใจจากความเจ็บปวด วิธีนี้ต้องอาศัยการฝึกฝน และการเตรียมตัวตั้งแต่ในระยะตั้งครรภ์จึงจะสามารถปฏิบัติได้อย่างมีประสิทธิภาพ (10 คะแนน)
	เทคนิคการหายใจ: การหายใจจะช่วยให้ผู้คลอดผ่อนคลายความปวดได้ในระดับหนึ่ง เนื่องจากผู้คลอดมุ่งความสนใจมาอยู่ที่ลมหายใจ ทั้งนี้เพื่อให้ผู้คลอดและทารกในครรภ์ได้รับออกซิเจนที่เพียงพอ ร่างกายและจิตใจผ่อนคลาย ลดความไม่สุขสบายและความวิตกกังวล และเบี่ยงเบนความสนใจไปจากการหดรัดตัวของมดลูก เทคนิคการหายใจที่มีผู้นิยมใช้กันมาก คือ เทคนิคการหายใจของ Lamaze ซึ่งแบ่งตามระยะของการคลอด ดังนี้
ซึ่งผู้คลอดรายนี้ Cervix dilated 5 cm. อยู่ในระยะ Active ตั้งแต่ปากมดลูกเปิด 3-8 เชนติเมตร เป็นระยะที่มดลูกหดรัดตัวรุนแรงมากขึ้น ควรให้หายใจแบบช้าๆ สลับกับการหายใจแบบตื้น เบา เร็ว (shallow accelerated-decelerated pattern) (10 คะแนน)
	ช่วงมดลูกเริ่มหดรัดตัว (Increment) ให้หายใจล้างปอด 1 ครั้งต่อด้วยการหายใจเข้า-ออกช้าๆ (5 คะแนน)
	ช่วงมดลูกหดรัดตัวเต็มที่ (acme) ให้เปลี่ยนมาเป็นการหายใจแบบตื้น เบา เร็ว (5 คะแนน)
	ช่วงมดลูกเริ่มคลายตัว (Decrement) หายใจเข้าออกช้าๆ และเมื่อมดลูกคลายตัวให้หายใจล้างปอดอีกครั้ง (5 คะแนน)
	สิ่งที่ต้องคำนึงถึงเมื่อใช้เทคนิคการหายใจ คือ ใช้เทคนิคการหายใจเฉพาะขณะที่มดลูกมีการหดรัดตัวเท่านั้น และให้หายใจล้างปอด (Cleaning breath) 1 ครั้ง ทั้งก่อนและหลังมดลูกหดรัดตัวทุกครั้ง โดยหายใจเข้าลึกๆ ยาวๆ และหายใจออกยาวๆ (5 คะแนน)
	ช่วงการหายใจเข้าและออกจะต้องเท่ากัน เป็นจังหวะสม่ำเสมอ (5 คะแนน)
	การหายใจเร็วและลึกเกินไปในขณะเดียวกัน (hyperventilation) จะทำให้เกิดความไม่สมดุลระหว่างออกซิเจน และคาร์บอนไดออกไซด์ เกิดอาการง่วงนอน ปวดได้ เมื่อเกิดภาวะดังกล่าวให้หายใจในถุงกระคาษหรือใช้ถุงกระดาษครอบศีรษะ (5 คะแนน)
	การถู นวด และลูบสัมผัส วิธีการนี้อาจให้ผู้คลอดทำเอง หรือผู้ช่วยทำให้ก็ได้ แต่ให้คำนึงถึงความต้องการของผู้คลอดด้วย เนื่องจากผู้คลอดแต่ละคนจะมีความต้องการไม่เหมือนกัน บางคนจะรู้สึกหงุดหงิด รำคาญไม่ต้องการให้ผู้อื่นมาสัมผัสก็ได้ ในกรณีเช่นนี้ให้เลี่ยง ไปใช้วิธีอื่นแทน เช่น ประคบร้อนหรือเย็นบริเวณที่ปวดก็สามารถช่วยบรรเทาปวดได้ เช่นกัน
การถูหรือนวด ต้องใช้แรงกดลงพอสมควรโดยกำมือและใช้กำปั้นถูหรือนวดที่บริเวณกระเบนเหน็บ ซึ่งเป็นบริเวณที่มีความเจ็บปวด จึงเป็นวิธีที่ช่วยควบคุมความเจ็บปวด โดยอาศัยหลักการทฤษฎีควบคุมประตู คือ การถูหรือนวดเป็นการกระตุ้นใยประสาทที่มีเส้นผ่าศูนย์กลางขนาดใหญ่ ทำให้ประตูที่ควบคุมการส่งผ่านพลังประสาทที่ไขสันหลังถูกปิดบางส่วนหรือปิดสนิท จึงไม่มีการส่งผ่านพลังประสาท ความรู้สึกปวดจึงลดลง (10 คะแนน)
	การลูบสัมผัส (effleurage) โดยการใช้ปลายนิ้วมือลูบเป็นวงกลมด้วยจังหวะที่สม่ำเสมอ ที่บริเวณหน้าท้อง หรือหน้าขา ไม่ต้องออกแรงกดบนกล้ามเนื้อเช่นเดียวกับการนวด (10 คะแนน)
	การลดสิ่งกระตุ้นที่ทำให้รู้สึกไม่สุขสบาย สิ่งกระตุ้นที่ทำให้ผู้คลอดไม่สุขสบาย ทั้งปัจจัยภายในร่างกายและปัจจัยภายนอก เช่น ความร้อน ความเปียกชื้น แสง เสียง ฯลฯ ซึ่งสิ่งกระตุ้นเหล่านี้จะทำให้การรับรู้ต่อความปวดเพิ่มขึ้น ดังนั้นพยาบาลควรให้การพยาบาลและคำแนะนำที่ลดสิ่งกระตุ้น เพื่อให้การรับรู้ต่อความปวดของผู้คลอดลดลง เช่น การดูแลให้ร่างกายและสิ่งแวดล้อมให้สะอาด สงบ การทำความสะอาดอวัยวะสืบพันธุ์ การดูแลผ้าปูที่นอนให้สะอาดและแห้งอยู่เสมอ ดูแลให้บ้วนปาก เพื่อลดความแห้งของปาก วางผ้าเย็นที่หน้าผาก คอ จะช่วยให้ผู้คลอดรู้สึกสุขสบายขึ้น หรือปรับอุณหภูมิห้องให้เหมาะสม ให้อากาศถ่ายเทได้สะดวก ลดเสียงรบกวนลง เป็นต้น (10 คะแนน)
	การเบี่ยงเบนความสนใจ โดยมุ่งเน้นให้ผู้คลอดเบี่ยงเบนความสนใจต่อความปวด ที่เกิดขึ้น โดยหากิจกรรม หรือมุ่ง ความสนใจไปในเรื่องอื่น ทั้งนี้เพื่อให้ผู้คลอดรับรู้ต่อความปวดลดลง (10 คะแนน)
	การฟังดนตรี เลือกฟังเสียงดนตรีที่คุ้นเคยหรือชอบ นอกจากช่วยเบี่ยงเบนความสนใจแล้ว ยังเป็นการช่วยผ่อนคลายความตึงเครียดได้อีกด้วย ขณะฟังเพลงควรแนะนำให้ผู้คลอดสร้างจินตนาการกับเสียงดนตรีที่ได้ฟัง ซึ่งจะทำให้รู้สึกผ่อนคลายร่างกายทุกส่วน (10 คะแนน)
	เทคนิคการผ่อนคลาย (relaxation techniques) เทคนิคการผ่อนคลายมีหลายรูปแบบ เช่น การเกร็งและคลายกล้ามเนื้อ เป็นการเกร็งและคลายกล้ามเนื้อทีละส่วนทั่วร่างกาย เริ่มตั้งแต่หัวแม่เท้าจรดศีรษะ (10 คะแนน)
	การประคบร้อนหรือเย็น การประคบร้อนหรือเย็นนี้อาจใช้กระเป๋าน้ำร้อน ถุงเย็น ผ้าเย็น ฯลฯ อีกวิธีหนึ่งที่ได้รับความนิยมในปัจจุบัน คือ การแช่น้ำอุ่น (Hydrotherapy) เมื่อผู้คลอดรู้สึกเจ็บครรภ์ถี่ ให้นอนแช่ในอ่างน้ำอุ่นที่มีอุณหภูมิประมาณ 37 องศาเซลเซียส ความอุ่นของน้ำจะทำให้เส้นเลือดขยาย กล้ามเนื้อผ่อนคลายและรู้สึกสุขสบายขึ้น (10 คะแนน)

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

router.post('/ob/5', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `ob/lab5/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        const feedbackJson = await processTranscriptionOBLab5(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 5,
            subject: 'ob',
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

async function processTranscriptionOBLab5(transcription) {
    const answerKey = `
    
ข้อมูลผู้ป่วย: คุณสุนิสา มีสุข 30 ปี G1P1001 ปัจจุบัน หลังคลอดวันที่ 3 คลอดปกติ ทารกเพศหญิง น้ำหนัก 3350 กรัม แข็งแรงดี
ข้อมูลด้านสุขภาพ น้ำหนักก่อนตั้งครรภ์ 65 กิโลกรัม ส่วนสูง 160 เซนติเมตร (BMI 25.4 kg/m²) ขณะตั้งครรภ์ได้รับการวินิจฉัยว่าเป็นเบาหวานขณะตั้งครรภ์ (GDM) ในไตรมาสที่สอง สามารถควบคุมระดับน้ำตาลได้ด้วยการควบคุมอาหาร น้ำหนักก่อนคลอด 83 กิโลกรัม (น้ำหนักขึ้นระหว่างตั้งครรภ์ 18 กิโลกรัม)
ข้อมูลเพิ่มเติม:
สัญญาณชีพ: ปกติ (T=37.2°C, P=82/min, R=18/min, BP=115/75 mmHg)
การตรวจร่างกาย: ยอดมดลูกคลำได้ 3 นิ้วมือใต้ระดับสะดือ, น้ำคาวปลาสีแดงสด (Lochia rubra) ปริมาณน้อย, แผลฝีเย็บไม่มีลักษณะบวมแดง, เต้านมคัดตึงเล็กน้อย หัวนมปกติ ทารกดูดนมได้ดี
ผลตรวจเลือด: ระดับน้ำตาลในเลือดหลังคลอดกลับมาอยู่ในเกณฑ์ปกติแล้ว
คำสั่งการรักษาของแพทย์ก่อนจำหน่าย (Discharge Order):
จำหน่ายกลับบ้านได้ (Discharge today)
นัดตรวจหลังคลอด 6 สัปดาห์ (Follow up at 6 weeks postpartum)
ยาที่ให้กลับบ้าน: Ferrous fumarate 1x1 oral pc, Ibuprofen 400 mg 1 tab oral prn for pain
หลังแพทย์มีคำสั่งให้จำหน่ายกลับบ้านได้ นักศึกษาคำจะให้แนะนำในการปฏิบัติตัวที่บ้านอย่างไร


เฉลย
การดูแลตนเองทั่วไป (Self-Care) 
ด้านการพักผ่อน (5)
การดูแลแผลฝีเย็บ วิธีการดูแลความสะอาด การสังเกตลักษณะน้ำคาวปลาที่จะค่อยๆ เปลี่ยนสีและลดปริมาณลง, และอาการผิดปกติที่ควรกลับมาพบแพทย์ (เช่น มีไข้, น้ำคาวปลามีกลิ่นเหม็น) (15)
หลีกเลี่ยงการยกของหนัก การเกร็งหน้าท้อง หรือการออกกำลังกายที่ต้องกระโดด (5)
รูปแบบการรับประทานอาหาร 
ดื่มน้ำให้เพียงพอเพื่อช่วยเรื่องการเลี้ยงลูกด้วยนมมารดา (10)
เลือกคาร์โบไฮเดรตที่ดี เช่น เลือกทานข้าวกล้อง ขนมปังโฮลวีท แทนข้าวขาว จะช่วยคุมระดับน้ำตาลได้ดีกว่าและอิ่มนานกว่า (10)
 โปรตีนทุกมื้อโดยเฉพาะโปรตีนดีที่ไม่แปรรูป เช่น ปลา ไข่ ไก่ หรือเต้าหู้ จะช่วยให้ร่างกายซ่อมแซมตัวเองได้ดีและทำให้อิ่ม (5)
หากจำเป็นต้องรับประทานอาหารว่างสุขภาพ แนะนำทานเป็นผลไม้รสไม่หวานจัด เช่น ฝรั่ง แอปเปิ้ล หรือโยเกิร์ต จะดีกว่าขนมหวาน (5)
เลือกรับประทานอาหารที่เพิ่มน้ำนม เช่น น้ำขิง แกงเลียง ใบแมงลัก เป็นต้น (5)
กิจกรรมทางกายเบื้องต้น  แนะนำการเคลื่อนไหวเบาๆ เช่น การเดินในบ้าน ยังไม่ควรออกกำลังกายหนัก ๆ (5)
การบริหารกล้ามเนื้ออุ้งเชิงกราน (Kegel Exercises) แนะนำให้ขมิบกล้ามเนื้อบริเวณช่องคลอด และทางเปิดของหนทางคลอด (5)
การนัดหมายและการมาตรวจตามนัด โดยนัดครั้งแรกที่ 6 สัปดาห์ เพื่อประเมินการฟื้นตัวของร่างกายโดยรวม และคือจะมีการ ตรวจคัดกรองเบาหวานหลังคลอด (5) (Postpartum OGTT) เพื่อดูว่าระดับน้ำตาลของของสตรีกลับมาเป็นปกติสมบูรณ์แล้วหรือไม่
การสังเกตอาการผิดปกติที่ต้องมาตรวจก่อนเวลานัด เช่น มีเลือดออก แผลฝีเย็บบวมแดงปวดมากขึ้น มีอาการคัดตึงเต้านมมาก เต้านมบวมแดงร้อน มีไข้ (10)
ให้มารดารับประทานยาตามคำสั่งแพทย์ ทั้งนี้ยาเสริมธาตุเหล็กอาจทำให้มีอุจจาระดำได้ และไม่ควรทานพร้อมนม ส่วนยาบรรเทาปวดสามารถรับประทานได้ทุก 4 ถึง 6 ชั่วโมงเมื่อมีอาการปวด (5)
แนะนำให้พาทารกมารับวัคซีนตามเวลานัด รวมทั้งสังเกตอาการผิดปกติของทารก เช่น มีไข้ มีอาการสะดืออักเสบ เช่น สะดือแดง มีสารคัดหลั่งผิดปกติ บวม เป็นต้น (5)
แนะนำให้เลี้ยงบุตรด้วยนมมารดาอย่างเดียวจนถึง 6 เดือนหลังคลอด โดยไม่มีอาหารเสริมหรือน้ำ (5)
 หากระหว่างการเลี้ยงบุตรด้วยนมมารดา มีปัญหา สามารถนำทารกกลับมารับคำปรึกษาที่คลินิกนมแม่หรือ ที่โรงพยาบาลใกล้บ้านได้ (5)

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

module.exports = router;