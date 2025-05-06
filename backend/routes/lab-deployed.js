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
MATERNAL AND CHILD
--post partum--
lab 1-10
*/

router.post('/maternalchild-1', authMiddleware, async (req, res) => {
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

        // Transcription IApp
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

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

// chinese version
router.post('/upload-1-cn', authMiddleware, async (req, res) => {
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
        const feedbackJson = await processTranscriptionLab1cn(transcription);
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
async function processTranscriptionLab1cn(transcription) {
    const answerKey = `
情境一：哺乳期间的乳头疼痛**

一名17岁的初产妇在产后一天分娩了一名健康的男婴，体重为2800克。母亲报告自己在哺乳时无法独立调整婴儿的正确姿势。尽管乳汁已经开始分泌，但她在哺乳过程中感到乳头疼痛，尤其是右侧比左侧更加疼痛。LATCH评分为5分（吸吮=1，吞咽声=1，乳头类型=2，舒适度=1，持握姿势=0）。

您会为这位母亲提供哪些建议？

可以考虑提供有关正确含乳哺乳的技术指导及解决她担忧的策略。

**建议指导（50分）

1. 教授正确的哺乳技术：（10分）
   - 强调正确姿势的重要性，确保婴儿的腹部与母亲的腹部对齐，以促进紧密接触。
   - 婴儿的头部应稍微后仰，身体保持笔直，并应深含乳晕以确保有效的含乳。

2.强调频繁哺乳的重要性：（10分）
   - 建议母亲每2-3小时或按需哺乳，每次哺乳大约持续20分钟，以确保婴儿摄入足够的乳汁。

3. 通过哺乳顺序进行疼痛管理：（10分）
   - 指导母亲从较不疼痛的乳房（此情况下为左侧）开始哺乳。如果婴儿仍感到饥饿，可以转向右侧乳房。在下一次哺乳时，从之前未完全排空的右侧乳房开始。

4. 防止乳头创伤：（10分）
   - 指教导母亲婴儿在吃饱后会自然松开乳头。避免在婴儿仍在吸吮时强行拔出乳头，因为这会导致乳头创伤。如有必要，母亲可以轻轻按压婴儿的下巴或用小指轻轻打开婴儿的嘴巴，以安全地解除吸力。

5. 有效吞咽模式的指导：（10分）
   - 指教导母亲观察婴儿有节奏的吞咽声，且没有任何吸吮声，这表明乳汁转移正常。

6. 评估乳汁摄入量的充足性：（5分）
   - 指导母亲通过观察婴儿的睡眠模式、排尿和排便的频率以及尿液的颜色来监测婴儿的乳汁摄入量。可以介绍“4 6 8规则 ”以进一步评估。

7. 促进乳汁分泌的技术：（5分）
   - 建议在哺乳前对乳房进行热敷，以促进乳汁流动并减轻不适。

8. 水分摄入建议：（5分）
   - 鼓励母亲经常喝温水，以维持水分摄入和促进乳汁分泌。

9. 讨论母乳喂养的益处：（5分）
   - 解释母乳喂养对母亲和婴儿的多方面益处，包括健康、情感联系和促进母婴关系等。

10. 促进泌乳的饮食建议：（5分）
    - 建议含有食用催乳作用的食物，如姜、罗勒、圣罗勒和豆浆，以支持和增加乳汁分泌。


您将如何演示正确的哺乳姿势和技术，以防止这位母亲的乳头疼痛？

建议演示（50分）

1. 演示最佳的哺乳姿势：（30分）
   - 在调整婴儿姿势时，确保婴儿的身体保持笔直，不扭曲颈部，腹部与母亲的腹部紧密接触。婴儿的脸应对准母亲的乳房，母亲应支撑支持婴儿的身体。正确的含乳应确保哺乳过程中无疼痛，乳头保持完好，吸吮模式一致且有效。

2. 哺乳后的护理：（10分）
   - 建议母亲在哺乳后将少量挤出的母乳涂抹在乳头上，以促进愈合并防止进一步刺激。

常见的哺乳姿势包括：

- 摇篮抱：婴儿横躺在母亲的腿上，面朝母亲。婴儿的腹部应与母亲的腹部接触。母亲用一只手支撑婴儿的身体，同时用另一只手托住婴儿的臀部和大腿。婴儿的嘴巴应对准乳头，头部应稍高于身体（10分）。

- 改良摇篮抱：母亲用哺乳侧的手支撑乳房，另一只手支撑婴儿的颈部和头部后方。这种姿势是摇篮抱的变体（10分）。

-橄榄球抱：母亲将婴儿半躺着抱起，支撑婴儿的颈部和头部后方。婴儿的身体靠近母亲的侧面，双腿朝后。婴儿从与母亲手同侧的乳房吸吮吸奶（10分）。

-侧卧位：母亲和婴儿都侧卧，面对面。母亲应保持头部略微抬高，背部和臀部保持直立。婴儿的嘴巴应与母亲的乳头对齐。母亲用下一只手支撑婴儿的背部，并用上另一只手支撑乳房以帮助婴儿含乳（10分）。


满分为100分。
`;

    const checkContent = `
学生的答案是："${transcription}"。
标准答案是："${answerKey}"。
请比较学生的答案和标准答案，评估是否切中要点，并详细解释学生做得好的地方，同时给出建议。不需要列出部分分数。请用中文回答。
不要批评语法或无关的问题。
请将评估结果转换为以下JSON格式：
    {
    "totalScore": <学生获得的分数>,
    "pros": "<学生做得好的方面>",
    "recommendations": "<建议>"
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

// english version
router.post('/upload-1-en', authMiddleware, async (req, res) => {
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
        const feedbackJson = await processTranscriptionLab1en(transcription);
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
async function processTranscriptionLab1en(transcription) {
    const answerKey = `
Scenario 1: Breastfeeding with Nipple sore
A 17-year-old primiparous mother, one day postpartum, has given birth to a healthy male infant weighing 2800 grams. The mother reports difficulty in independently positioning the infant for breastfeeding. Lactation has commenced; however, she experiences nipple pain during breastfeeding, with more intense discomfort on the right side compared to the left. The LATCH score is 5 (latch on = 1, audible = 1, type of nipple = 2, comfort = 1, holding = 0).

1.	What guidance would you provide to this mother?
Consider providing advice on proper latching techniques and strategies to address her concerns.
1. Educate on Proper Breastfeeding Technique: (10 points).
   - Emphasize the importance of correct positioning, ensuring that the infant's abdomen is aligned with the mother’s abdomen, facilitating close contact.
   - The infant’s head should be slightly extended, with the body in a straight alignment, and the infant should latch onto the areola deeply to achieve an effective latch 
  
2. Highlight the Significance of Frequent Feeding: (10 points).
   - Advise the mother to breastfeed every 2-3 hours or on-demand, with each session lasting approximately 20 minutes to ensure adequate milk intake 
3. Pain Management through Feeding Sequence: (10 points).
   - Instruct the mother to initiate feeding on the less painful breast (left side in this case). If the infant remains hungry, switch to the right breast. In subsequent feedings, begin with the right breast that was previously left unemptied 
4. Prevention of Nipple Trauma: (10 points).
   - Educate the mother that the infant will naturally release the nipple once satiated. Advise against forcibly removing the nipple while the infant is still latched, as this can cause nipple trauma. If necessary, the mother can gently press the infant's chin or use her pinky finger to break the suction safely 
5. Instruction on Effective Swallowing Patterns: (10 points).
   - Teach the mother to observe rhythmic and audible swallowing sounds without any smacking noises, indicating proper milk transfer 
6. Assessment of Milk Intake Adequacy:
   - Guide the mother on monitoring the infant’s milk intake by observing sleep patterns, frequency of urination and defecation, and urine color. Introduce the "4 6 8 rule" for further assessment (5 points).

7. Milk Production Enhancement Techniques: (5 points).
   - Recommend the application of a warm compress to the breasts before feeding to enhance milk flow and reduce discomfort 
8. Hydration Advice: (5 points).
   - Encourage the mother to drink warm water frequently to support hydration and milk production 
9. Discuss the Benefits of Breastfeeding: (5 points).
   - Explain the multifaceted benefits of breastfeeding for both the mother and the infant, including health, emotional, and bonding aspects 
10. Dietary Recommendations for Lactation Support: (5 points).
    - Suggest lactogenic foods such as ginger, basil, holy basil, and soy milk to support and increase milk production.


2.	How would you demonstrate proper breastfeeding positions and techniques to prevent nipple sore for this mother?
Suggested Demonstration (50 points)
1. Demonstration of Optimal Breastfeeding Positions: (30 points).
   - While positioning the infant, ensure that the infant’s body is aligned without neck twisting, with the abdomen in close contact with the mother’s abdomen. The infant’s face should face the breast, and the mother should provide support to the infant’s body. Correct latching should result in pain-free breastfeeding, with intact nipples and consistent, effective suckling patterns 

2. Post-Feeding Care: (10 points).
   - Advise the mother to apply a small amount of expressed breast milk to her nipples post-feeding to promote healing and prevent further irritation 
Common Breastfeeding Positions Include: 
- Cradle Hold: The infant lies across the mother’s lap, facing her. The infant’s abdomen should be in contact with the mother’s abdomen. The mother supports the infant’s body with one arm while cupping the infant’s bottom and thighs with her hand. The infant’s mouth should align with the nipple, and the head should be slightly elevated above the body (10 points).

- Modified Cradle Hold: The mother uses the same hand as the breastfeeding side to support the breast, while the opposite hand supports the infant’s neck and back of the head. This position is a variation of the cradle hold (10 points).
- Football Hold: The mother holds the infant in a semi-reclined position, supporting the infant’s neck and back of the head. The infant’s body is positioned against the mother’s side, with the legs pointing backward. The infant feeds from the breast on the same side as the mother’s hand (10 points).
- Side-Lying Position: Both the mother and infant lie on their sides, facing each other. The mother should maintain a slightly elevated head position, with a straight back and hips. The infant’s mouth should be aligned with the mother’s nipple. The mother uses her lower hand to support the infant’s back and the upper hand to support the breast during latching (10 points).


full-score = 100 points
`;

    const checkContent = `
this is student's answer: "${transcription}".
this is the answer key: "${answerKey}".

Please compare the student's answer with the solution. Evaluate if it addresses the key points, and provide a detailed explanation of what the student did well along with recommendations. Do not break down partial scores. Answer in English.
Do not critique grammar or unrelated issues.
Please convert the evaluation results into JSON format as follows:
    {
    "totalScore": <score the student received>,
    "pros": "<points the student did well>",
    "recommendations": "<recommendations>"
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

// english version
router.post('/upload-1-jp', authMiddleware, async (req, res) => {
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
        const feedbackJson = await processTranscriptionLab1jp(transcription);
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
async function processTranscriptionLab1jp(transcription) {
    const answerKey = `
実習1：母乳育児 - 乳頭痛のケース

この母親にどのようなアドバイスをしますか？例えば、正しい授乳方法、4回の授乳、問題解決など。

解答（50点）

正しい授乳方法を説明し、赤ちゃんを母親の体に密着させ、赤ちゃんのお腹と母親のお腹を密着させ、赤ちゃんの顔をわずかに上向きにし、赤ちゃんの体をまっすぐにして、乳輪まで深く含ませることを強調する（10点）
頻繁な授乳の詳細を説明する。例えば、2-3時間ごと、または赤ちゃんが求めるときに授乳し、各授乳は20分程度続ける（10点）
痛みの少ない方の乳房から始める。この場合、左側から始め、赤ちゃんがまだ満足していない場合は右側に移る。次の授乳では、前回途中で終わった右側から始める（10点）
赤ちゃんが満足したら、自然に乳首を離す。まだ吸っている場合は、乳首を引っ張らないこと（乳首を傷つける可能性がある）。授乳を中止したい場合は、赤ちゃんの顎を軽く押すか、小指を赤ちゃんの口に入れて口を開けさせ、乳首を離す（10点）
正しい嚥下の特徴を説明する。例えば、リズミカルな嚥下音を観察し、吸う音ではなく空気の音（チュパチュパ音）がすること（10点）
母乳の十分さを観察する方法を説明する。例えば、赤ちゃんの睡眠パターン、排尿・排便の回数、尿の色など。または「4 6 8ルール」を紹介する（5点）
授乳前に温湿布を行い、母乳の量を増やす方法を勧める（5点）
温かい水を頻繁に飲むことを勧める（5点）
母乳の母子両方への利点を説明する（5点）
母乳の分泌を促進する食品を勧める。例えば、生姜、バジル、ホーリーバジル、豆乳など（5点）


この母親に正しい抱き方と乳頭痛の緩和/予防をどのように実演しますか？

解答（50点）

正しい授乳姿勢を実演する。授乳時、赤ちゃんの体をまっすぐに保ち、首をねじらず、赤ちゃんのお腹を母親のお腹に密着させ、赤ちゃんの顔を乳房に向け、母親の手で赤ちゃんの体を支える。正しく吸着できれば、母親は乳頭痛を感じず、乳首も傷つかず、赤ちゃんの吸啜リズムも一定になる（30点）
授乳後、母乳を乳頭に塗るよう勧める（10点）
使用できる授乳姿勢には以下がある：

クレードルホールド：赤ちゃんを横抱きにし、母親の体に向けて横向きにする。赤ちゃんのお腹を母親のお腹に密着させ、腕で赤ちゃんの背中を支え、手のひらでお尻と太ももを支える。赤ちゃんの口が乳首の位置に来るようにし、頭と体をまっすぐに保ち、頭を少し高くする（10点）
モディファイドクレードルホールド：クレードルホールドから手を変え、授乳する側の手で乳房を支え、もう一方の手で赤ちゃんの首と後頭部を支える（10点）
フットボールホールド：赤ちゃんを半横向き半仰向けに抱き、首と後頭部を手で支え、赤ちゃんを母親の脇に密着させる。赤ちゃんの足を母親の背中の方に向け、母親の手と同じ側の乳房から授乳する（10点）
横向き授乳：母子ともに横向きに寝て向かい合う。母親は頭を少し高くし、背中と腰をできるだけまっすぐにする。赤ちゃんの口が母親の乳首の位置に来るようにする。下側の手で赤ちゃんの背中を支え、上側の手で最初に乳首を赤ちゃんの口に入れる際に乳房を支える（10点）

満点は 100 点です。
`;

    const checkContent = `
これは学生の回答です： "${transcription}".
これは模範解答です： "${answerKey}".

学生の回答と模範解答を比較し、回答が的確かどうかを評価してください。また、学生が上手くできた点を詳細に説明し、改善のための提案も行ってください。各小項目の得点については言及せず、日本語で回答してください。
文法や関係のない事項については指摘しないでください。
評価結果を以下のJSON形式に変換してください：
    {
        "totalScore": <学生の得点>,
        "pros": "<学生が上手くできた点>",
        "recommendations": "<改善のための提案>"
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

// indonesia version
router.post('/maternalchild-1-indo', authMiddleware, async (req, res) => {
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
        const feedbackJson = await processTranscriptionLab1indo(transcription);
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
async function processTranscriptionLab1indo(transcription) {
    const answerKey = `
Skenario 1: Menyusui dengan Puting Lecet

Seorang ibu primipara berusia 17 tahun, satu hari pascapersalinan, telah melahirkan bayi laki-laki sehat dengan berat 2800 gram. Ibu melaporkan kesulitan dalam memposisikan bayinya secara mandiri untuk menyusui. Laktasi telah dimulai, tetapi ia mengalami nyeri pada puting saat menyusui, dengan rasa sakit yang lebih intens di sisi kanan dibandingkan sisi kiri. Skor LATCH-nya adalah 5 (pelekatan = 1, suara terdengar = 1, jenis puting = 2, kenyamanan = 1, posisi memegang bayi = 0).

1. Apa panduan yang akan Anda berikan kepada ibu ini? Pertimbangkan untuk memberikan nasihat tentang teknik pelekatan yang benar dan strategi untuk mengatasi keluhan ibu.

1. Edukasi Teknik Menyusui yang Benar: (10 poin)

Tekankan pentingnya posisi yang benar, pastikan perut bayi sejajar dengan perut ibu untuk memudahkan kontak erat.
Kepala bayi harus sedikit terangkat dengan tubuh lurus, dan bayi harus menyusu pada areola secara mendalam untuk mencapai pelekatan yang efektif.
2. Pentingnya Pemberian ASI secara Sering: (10 poin)

Sarankan ibu untuk menyusui setiap 2-3 jam atau sesuai permintaan, dengan setiap sesi berlangsung sekitar 20 menit untuk memastikan asupan ASI yang cukup.
3. Manajemen Nyeri melalui Urutan Menyusui: (10 poin)

Instruksikan ibu untuk memulai menyusui pada payudara yang kurang sakit (dalam kasus ini, sisi kiri). Jika bayi masih lapar, pindahkan ke payudara kanan. Pada sesi berikutnya, mulai dengan payudara kanan yang sebelumnya belum dikosongkan.
4. Pencegahan Trauma Puting: (10 poin)

Edukasi ibu bahwa bayi secara alami akan melepaskan puting ketika kenyang. Sarankan agar tidak menarik puting secara paksa saat bayi masih menyusu karena dapat menyebabkan trauma pada puting. Jika perlu, ibu bisa menekan dagu bayi dengan lembut atau menggunakan jari kelingking untuk melepaskan hisapan dengan aman.
5. Instruksi Mengenai Pola Menelan yang Efektif: (10 poin)

Ajarkan ibu untuk mengamati pola menelan yang ritmis dan terdengar tanpa suara cecapan, yang menunjukkan transfer ASI yang baik.
6. Penilaian Kecukupan Asupan ASI: (5 poin)

Pandu ibu untuk memantau asupan ASI bayi dengan mengamati pola tidur, frekuensi buang air kecil dan besar, serta warna urin. Perkenalkan aturan "4 6 8" untuk penilaian lebih lanjut.
7. Teknik Peningkatan Produksi ASI: (5 poin)

Rekomendasikan aplikasi kompres hangat pada payudara sebelum menyusui untuk meningkatkan aliran ASI dan mengurangi ketidaknyamanan.
8. Saran Mengenai Hidrasi: (5 poin)

Dorong ibu untuk sering minum air hangat untuk mendukung hidrasi dan produksi ASI.
9. Diskusikan Manfaat Menyusui: (5 poin)

Jelaskan berbagai manfaat menyusui bagi ibu dan bayi, termasuk aspek kesehatan, emosional, dan ikatan.
10. Rekomendasi Diet untuk Mendukung Laktasi: (5 poin)

Sarankan makanan laktogenik seperti jahe, basil, kemangi, dan susu kedelai untuk mendukung dan meningkatkan produksi ASI.
2. Bagaimana Anda akan mendemonstrasikan posisi dan teknik menyusui yang benar untuk mencegah puting lecet pada ibu ini?

Demonstrasi yang Disarankan (50 poin)

1. Demonstrasi Posisi Menyusui yang Optimal: (30 poin)

Saat memposisikan bayi, pastikan tubuh bayi sejajar tanpa memutar leher, dengan perut bersentuhan erat dengan perut ibu. Wajah bayi harus menghadap payudara, dan ibu harus memberikan dukungan pada tubuh bayi. Pelekatan yang benar akan menghasilkan menyusui tanpa rasa sakit, dengan puting tetap utuh dan pola hisapan yang konsisten dan efektif.
2. Perawatan Setelah Menyusui: (10 poin)

Sarankan ibu untuk mengoleskan sedikit ASI perah ke puting setelah menyusui untuk mempercepat penyembuhan dan mencegah iritasi lebih lanjut.
Posisi Menyusui yang Umum Meliputi:

Cradle Hold: Bayi berbaring melintang di pangkuan ibu, menghadap ibu. Perut bayi harus bersentuhan dengan perut ibu. Ibu mendukung tubuh bayi dengan satu lengan sambil memegang pantat dan paha bayi dengan tangan. Mulut bayi harus sejajar dengan puting, dan kepala harus sedikit terangkat di atas tubuh (10 poin).

Modified Cradle Hold: Ibu menggunakan tangan yang sama dengan sisi menyusui untuk mendukung payudara, sementara tangan yang berlawanan mendukung leher dan belakang kepala bayi. Posisi ini adalah variasi dari cradle hold (10 poin).

Football Hold: Ibu memegang bayi dalam posisi semi-reclining, mendukung leher dan belakang kepala bayi. Tubuh bayi ditempatkan di samping ibu, dengan kaki mengarah ke belakang. Bayi menyusu dari payudara di sisi yang sama dengan tangan ibu (10 poin).

Posisi Berbaring Miring: Ibu dan bayi berbaring di sisi mereka, saling berhadapan. Ibu harus mempertahankan posisi kepala yang sedikit terangkat, dengan punggung dan pinggul lurus. Mulut bayi harus sejajar dengan puting ibu. Ibu menggunakan tangan bagian bawah untuk mendukung punggung bayi dan tangan bagian atas untuk mendukung payudara saat proses pelekatan (10 poin).

skor penuh = 100 poin
`;

    const checkContent = `
ini adalah jawaban siswa: "${transcription}".
ini adalah kunci jawaban: "${answerKey}".

Silakan bandingkan jawaban siswa dengan solusi. Evaluasi apakah jawaban tersebut mencakup poin-poin kunci, dan berikan penjelasan terperinci tentang apa yang sudah dilakukan dengan baik oleh siswa, serta rekomendasi yang diperlukan. Jangan memecah menjadi penilaian parsial. Jawab dalam Bahasa Inggris. 
Jangan mengkritik tata bahasa atau hal-hal yang tidak terkait.
Harap konversi hasil evaluasi ke format JSON sebagai berikut:
{
    "totalScore": <skor yang diterima siswa>,
    "pros": "<poin yang dilakukan siswa dengan baik>",
    "recommendations": "<rekomendasi>"
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

router.post('/maternalchild-2', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `lab2/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab2(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 2,
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
router.post('/maternalchild-3', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `lab3/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab3(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 3,
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
router.post('/maternalchild-4', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `lab4/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab4(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 4,
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

router.post('/maternalchild-4-en', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `lab4/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab4En(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 4,
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
async function processTranscriptionLab4En(transcription) {
    const answerKey = `
Lab 4: Family Planning - Oral Contraceptive Pills

What advice would you give this postpartum mother about an appropriate contraceptive method? Recommend one method.

Answer: (10 points if selecting any one of these options)

Low-dose hormonal contraceptive pills (Minipills)
Injectable contraceptives
Contraceptive implant
Abstinence
Lactational Amenorrhea Method (LAM)
Condom
If this postpartum mother is considering using progestin-only contraceptive pills, what advice would you give her regarding their use, potential side effects, and appropriate solutions if she forgets to take a pill?

Answer: (90 points)

Progestin-only pills (minipills) are suitable for breastfeeding mothers because they do not affect milk production. (25 points)
This type of pill helps thicken cervical mucus, making it more difficult for sperm to enter. (15 points)
Each pack contains 28 pills with no placebo pills. The mother should take one pill every day without a break and at the same time daily to maintain a steady hormone level. Missing doses may reduce the pill's effectiveness. (30 points)
If a pill is missed for one day, take it as soon as possible. If two days are missed, take one missed pill in the morning as soon as it’s remembered, take the regular dose in the evening, and continue this pattern for subsequent days. If three days or more are missed, discard the current pack, wait for the next menstrual period, and start a new pack. (25 points)
Advise the woman to monitor for side effects, such as irregular periods, spotting, breast tenderness, or mood changes. (15 points)
Total Score: 100 Points
`;

    const checkContent = `
Here is the student's answer: "${transcription}".
Here is the answer key: "${answerKey}".

Please compare the student's answer with the answer key. Assess if it is on point and provide detailed feedback on what the student did well and recommendations for improvement, without commenting on grammar or unrelated issues.
answer in english and in form of json
    {
    "totalScore": <student's score>,
    "pros": "<things the student did well>",
    "recommendations": "<suggestions for improvement>"
    }
`;

    const response = await openai.chat.completions.create({
        messages: [{ role: "system", content: checkContent }],
        model: "gpt-4o",
        response_format: { "type": "json_object" }
    });

    const feedbackJson = JSON.parse(response.choices[0].message.content.trim());
    //console.log(feedbackJson);
    return feedbackJson;
}

router.post('/maternalchild-4-cn', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `lab4/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab4Cn(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 4,
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
async function processTranscriptionLab4(transcription) {
    const answerKey = `
实验 4: 计划生育：口服避孕药

1. 您会如何建议这位产后母亲选择适合的避孕方法？请推荐一种方法。

答案：如果选择以下任意一种方法，得分为10分：

低剂量激素口服避孕药（Minipills）
注射避孕药（Injection）
避孕植入物（Contraceptive Implant）
禁欲（Abstinence）
哺乳避孕法（Lactation Amenorrhea Method）
安全套（Condom）
2. 如果这位产后母亲正在考虑使用仅含孕激素的口服避孕药，您会如何提供建议？请说明如何使用此类避孕药、可能出现的副作用以及忘记服药后的解决方法。

答案（90分）：

孕激素单一口服避孕药（Minipills/Progesterone-only pills）非常适合哺乳期的产后母亲，因为不会导致乳汁减少。（25分）
此类避孕药可以使宫颈黏液变得浓稠，阻止精子进入。（15分）
药片包装中共有28片，无空白药或安慰剂，建议每日服用且不得中断。应按时服药，以确保体内激素水平稳定。如果服药时间不规律，可能会降低避孕效果。（30分）
如果忘记服用一天，应在想起时立即服用。如果忘记两天，需按照以下方法处理：
第一天早上服用漏服的药片，当天晚上服用当天应服的药片；
第二天早上服用另一片漏服的药片，当晚继续服用当天应服的药片。
如果忘记服药超过三天，应弃用当前药板，等待月经来潮后再开始新的药板。（25分）
指导女性注意副作用，例如月经不规律、异常出血、乳房胀痛、情绪波动等。（15分）
总分：100分
`;

    const checkContent = `
这是学生的答案："${transcription}"
这是答案参考："${answerKey}"

请比较学生的答案与答案参考，判断是否切题，并详细说明学生表现出色的方面，同时提供改进建议。无需说明具体得分部分。
无需评论语法或与主题无关的内容。
请将评估结果转换为以下格式的 JSON：
    {
        "totalScore": <学生的得分>,
        "pros": "<学生表现出色的方面>",
        "recommendations": "<改进建议>"
    }
`;

    const response = await openai.chat.completions.create({
        messages: [{ role: "system", content: checkContent }],
        model: "gpt-4o",
        response_format: { "type": "json_object" }
    });

    const feedbackJson = JSON.parse(response.choices[0].message.content.trim());
    //console.log(feedbackJson);
    return feedbackJson;
}

router.post('/maternalchild-5', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `lab5/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab5(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 5,
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
router.post('/maternalchild-6', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `lab6/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab6(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 6,
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
router.post('/maternalchild-7', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `lab7/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab7(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 7,
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
router.post('/maternalchild-8', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `lab8/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab8(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 8,
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
router.post('/maternalchild-9', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `lab9/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab9(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 9,
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
router.post('/maternalchild-10', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `lab10/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab10(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 10,
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
async function processTranscriptionLab2(transcription) {
    const answerKey = `
Lab 2: การเลี้ยงลูกด้วยนมแม่ กรณีมารดาต้องไปทำงานนอกบ้าน
1.	ท่านจะให้คำแนะนำใดแก่มารดารายนี้ที่เตรียมตัวออกไปทำงานนอกบ้านอย่างไร (ครอบคลุมในประเด็น ประโยชน์ของนมแม่ อายุนมในตู้เย็น การใช้ถุงเก็บน้ำนม วิธีการละลายน้ำนม และอาหารเพิ่มน้ำนม)
เฉลย (70 คะแนน)
•	อธิบายประโยชน์ของนมมารดา (20 คะแนน)
ผลดีต่อแม่ เลือกตอบคำตอบใดก็ได้อย่างน้อย 2 ข้อ (10 คะแนน)
•	ทำให้รูปร่างสมส่วน
•	ป้องกันการตกเลือดหลังคลอด
•	มดลูกเข้าอู่หรือคืนสภาพเดิมเร็วขึ้น
•	สะดวกต่อแม่ ให้ลูกกินนมเวลาใดก็ได้
•	ลดความเสี่ยงต่อการเป็นมะเร็งเต้านม และมะเร็งรังไข่
ผลดีต่อลูก เลือกตอบคำตอบใดก็ได้อย่างน้อย 2 ข้อ (10 คะแนน)
•	นมแม่มีสารอาหารครบถ้วน ทำให้ลูกเจริญเติบโต และมีพัฒนาการที่สมบูรณ์ตามวัย
•	นมแม่มีภูมิต้านทานโรค ทำให้ลูกแข็งแรง ไม่ค่อยเจ็บป่วย
•	ลูกที่ดูดนมแม่จะสมองดี สติปัญญาดี เฉลียวฉลาด
•	ลูกและแม่จะมีความรักความผูกพันซึ่งกันและกัน ลูกจะมีสุขภาพจิตดีสามารถปรับตัวเข้ากับบุคคลอื่น และเข้าสังคมได้ดี
•	ลูกจะมีฟันที่แข็งแรง ฟันไม่ซ้อน และไม่ผุกร่อนเร็ว
•	ลูกจะมีอุจจาระไม่แข็ง

อธิบายอายุนมในตู้เย็นลักษณะต่างๆ (20 คะแนน)
วิธีการเก็บ	ระยะเวลา
เก็บที่อุณหภูมิห้อง ( > 25 องศาเซลเซียส)	1 ชั่วโมง
เก็บที่อุณหภูมิห้อง (< 25 องศาเซลเซียส)	4 ชั่วโมง
เก็บในกระติกน้ำแข็ง	1 วัน
เก็บที่ตู้เย็นช่องธรรมดา 0-4 ◦C	2-5 วัน
เก็บที่ตู้เย็นช่องแช่แข็ง (แบบประตูเดียว)	2 สัปดาห์
เก็บที่ตู้เย็นช่องแช่แข็ง (แบบสองประตู)	3 เดือน
สามารถระบุอายุนมเมื่อเก็บที่ตู้เย็นช่องแช่แข็งแบบประตูเดียว นมจะอยู่ได้นาน 2 สัปดาห์ (10 คะแนน)
สามารถระบุอายุนมเมื่อเก็บที่ตู้เย็นช่องแช่แข็งแบบสองประตู นมจะอยู่ได้นาน 3 เดือน (10 คะแนน)
o	ห้ามวางนมที่ฝาประตูตู้เย็น เนื่องจากฝาประตูตู้เย็นมีอุณหภูมิไม่สม่ำเสมอ (5 คะแนน)
o	เมื่อละลายนมแล้ว ไม่นำกลับไปใส่ช่องแช่แข็ง ควรใช้ให้หมด (5 คะแนน)


อธิบายการใช้ถุงเก็บน้ำนม (30 คะแนน)
o	เขียนรายละเอียดวันที่ เวลา ปริมาณนมไว้ตรงสติ้กเกอร์ข้างถุง (10 คะแนน)
o	เทน้ำนมที่ปั้มหรือบีบมาแล้วใส่ถุง วางแผนเทนมใส่ถุงให้พอดีกับช่วงเวลาที่ลูกจะใช้ เช่น ถ้าถุงนี้จะใช้ช่วงที่ลูก 4 เดือน ควรเทนมใส่ถุงประมาณ 4-4.5 ออนส์ เพราะทารก 4 เดือนจะทานนมปริมาณนี้ นมจะได้ไม่เหลือมาก เพราะหากละลายแล้ว จะไม่สามารถนำเก็บต่อได้อีก (10 คะแนน)
o	ไล่อากาศออกจากถุง ปิดซิปให้สนิท พร้อมแช่แข็ง (10 คะแนน)
o	เมื่อต้องการนำนมออกมาใช้ ควรนำถุงนมออกมาจากช่องฟรีส มาวางไว้ใต้ฟรีสเท่าที่จะใช้ในวันพรุ่งนี้ (เช่น จะให้ทาน 9, 12, 15 ต้องนำออกมารวม 3 ถุง) พอใกล้ถึงเวลาทารกกินนม ให้ละลายถุงนมทีละถุง แช่ในน้ำอุ่นประมาณ 1-2 ชม. ไม่ต้ม หรือใส่ไมโครเวฟ เมื่อนมละลายแล้ว สามารถให้ลูกได้ (10 คะแนน)
•	การเพิ่มปริมาณน้ำนมด้วยการประคบร้อน การดื่มน้ำ การทานอาหารที่เรียกน้ำนม (10 คะแนน)
•	แนะนำอาหารประเภทเรียกน้ำนม เช่น ขิง กระเพรา ใบแมงลัก นมถั่วเหลือง เป็นต้น (5 คะแนน)
•	การทำความสะอาดอุปกรณ์ในการปั๊มนม หรือ ภาชนะบรรจุนม (5 คะแนน)

2. ท่านจะสาธิตวิธีบีบนมเก็บ ให้กับมารดารายนี้อย่างไร 
เฉลย (30 คะแนน)
•	สาธิตการบีบน้ำนมจากเต้า 
1.	ล้างมือให้สะอาด (5 คะแนน)
2.	วางนิ้วหัวแม่มือบนขอบนอกลานหัวนม (10 คะแนน)
3.	นิ้วชี้อยู่ขอบนอกของลานหัวนมด้านตรงข้ามกับหัวแม่มือนิ้วอื่นประคองเต้านมไว้ (10 คะแนน)
4.	กดนิ้วชี้และนิ้วหัวแม่มือ เข้าหาอกแม่แล้วบีบสองนิ้วเข้าหากัน น้ำนมแม่จะพุ่งออก คลายนิ้วแล้วทำซ้ำจนน้ำนมหมด (10 คะแนน)
5.	เปลี่ยนตำแหน่งของนิ้ว เพื่อบีบให้รอบลานหัวนม (10 คะแนน)

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
async function processTranscriptionLab3(transcription) {
    const answerKey = `
Lab 3: การเลี้ยงลูกด้วยนมแม่ กรณีเต้านมคัดตึง
1.	คำแนะนำก่อนให้ลูกดูดนม (30 คะแนน)
•	ใช้ผ้าชุบน้ำอุ่นจัดประคบบริเวณเต้านมข้างขวาประมาณ 5-10 นาที เพื่อช่วยให้ท่อน้ำนมขยายและน้ำนมไหลได้ง่ายขึ้น (10 คะแนน)
•	นวดเต้านมข้างขวาเบาๆ เพื่อช่วยกระตุ้นการไหลของน้ำนม (10 คะแนน)
•	บีบน้ำนมออกเล็กน้อย เพื่อให้ลูกดูดนมได้ง่ายขึ้นและลดอาการคัดตึง (10 คะแนน) 
2.	ขณะลูกดูดนม (40 คะแนน)
•	จัดท่าให้นมให้ถูกต้อง (10 คะแนน)
•	ให้ลูกอมหัวนมให้ลึกถึงลานนม (10 คะแนน)
•	เห็นลานนมลานนมด้านบนมากว่าด้านล่าง (10 คะแนน)
•	คางลูกชิดเต้านมแม่ ท้องลูกแนบชิดท้องแม่ ตัวลูกได้รับการประคอง (10 คะแนน)
•	ให้ลูกดูดนมทั้งสองข้าง เริ่มให้ลูกดูดจากข้างที่คัดตึงก่อน (10 คะแนน)
•	ดูดจนเต้านมนิ่ม จากนั้นสลับไปดูดนมอีกข้าง (10 คะแนน)
3.	หลังจากลูกดูดนม (30 คะแนน) 
•	ทุกครั้งหลังให้ลูกกินนม บีบน้ำนมที่ยังเหลือค้างในเต้านมออกจนรู้สึกว่าเต้านมนิ่ม (15 คะแนน)
•	ระหว่างมื้อนมหากมีอาการปวด ให้ประคบเย็นเพื่อลดอาการปวด (15 คะแนน)

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
async function processTranscriptionLab4(transcription) {
    const answerKey = `
Lab 4: การวางแผนครอบครัว เรื่องยาเม็ดคุมกำเนิด
1.	ท่านจะให้คำแนะนำเกี่ยวกับวิธีการคุมกำเนิดที่เหมาะสมแก่มารดาหลังคลอดรายนี้อย่างไร แนะนำ 1 วิธี  
เฉลย หากเลือกตอบคำตอบใดคำตอบหนึ่งในรายการนี้ (คำตอบ 10 คะแนน) 
•	ยาเม็ดคุมกำเนิดชนิดฮอร์โมนต่ำ (Minipills)
•	ยาฉีดคุมกำเนิด (Injection)
•	รากฟันคุมกำเนิด (Contraceptive Implant)
•	การงดเว้นเพศสัมพันธ์ (Abstinence)
•	วิธีการคุมกำเนิดโดยการเลี้ยงลูกด้วยนมแม่ (Lactation Amenorrhea method)
•	ถุงยางอนามัย (Condom)

2.	หากมารดาหลังคลอดรายนี้ กำลังพิจารณาเลือกใช้ยาเม็ดคุมกำเนิดที่มีฮอร์โมนโปรเจสเตอโรนเพียงอย่างเดียว จะให้คำแนะนำอย่างไร เกี่ยวกับการใช้ยาเม็ดคุมกำเนิด ผลข้างเคียงที่อาจจะเกิดขึ้น และวิธีการแก้ไขปัญหาอย่างเหมาะสมกรณีที่ลืมรับประทานยาเม็ดคุมกำเนิด
เฉลย (90 คะแนน)
•	ยาคุมกำเนิดชนิดเดี่ยว (minipills/progesterone only pills) มีความเหมาะสมกับมารดาหลังคลอดที่เลี้ยงบุตรด้วยนม เพราะจะไม่ทำให้น้ำนมแห้ง  (25 คะแนน)
•	ยาคุมประเภทนี้จะช่วยทำให้มูกที่ปากมดลูกเหนียวข้น ทำให้สเปิร์มเคลื่อนเข้าไปยาก (15 คะแนน)
•	ในแผงยาจะมีจำนวน 28 เม็ด ไม่มียาหลอกหรือแป้ง มารดาควรรับประทานทุกวัน ไม่หยุด 
ควรรับประทานให้ตรงเวลาเพื่อให้ระดับฮอร์โมนอยู่ในระดับสูงสม่ำเสมอ หากทานไม่ตรงเวลา จะส่งผลถึงประสิทธิภาพลดลงได้ (30 คะแนน)
•	กรณีลืม 1 วัน รีบทานทันทีที่นึกได้ แต่หากลืมสองวัน ให้ทานเม็ดที่ลืมในตอนเช้าที่นึกได้ คืนนั้นทานเม็ดที่ต้องทานประจำ และเช้าอีกวัน ทานเม็ดที่ลืมเม็ดที่สอง คืนนั้นทานเม็ดที่ต้องทานตามปกติ แต่หากลืมเกิน 3 วัน ขอให้ทิ้งแผงนี้ไป และรอประจำเดือนมา ค่อยเริ่มแผงใหม่ (25 คะแนน)
•	ให้สตรีสังเกตอาการข้างเคียง เช่น ประจำเดือนมาไม่สม่ำเสมอ หรือมีเลือดออกผิดปกติ เต้านมคัดตึง อารมณ์เปลี่ยนแปลง (15 คะแนน)

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
    //console.log(feedbackJson);
    return feedbackJson;
}
async function processTranscriptionLab5(transcription) {
    const answerKey = `
Lab 5: การวางแผนครอบครัว เรื่องยาฝังคุมกำเนิด
1.	จะเริ่มฝังยาได้ตั้งแต่เมื่อใด (20 คะแนน)
•	กรณีไม่ได้ให้นมบุตรให้ฝังยาภายใน 4 สัปดาห์หลังคลอด หรือภายใน 21 วันหลังการคลอด (10 คะแนน) 
•	กรณีให้นมบุตรฝังยาในช่วง 4 สัปดาห์ ถึง 4 เดือน หรือฝังได้ทันทีหลังคลอด (10 คะแนน)  
2.	ประสิทธิภาพของยาฝังในการคุมกำเนิด (10 คะแนน)
•	มีประสิทธิภาพในการป้องกันการตั้งครรภ์สูง 99% (10 คะแนน)
•	มีโอกาสตั้งครรภ์น้อยกว่า 1 ต่อ 1000 (10 คะแนน)
•	มีโอกาสตั้งครรภ์น้อยกว่า 0.01% (10 คะแนน)
3.	ระยะเวลาที่สามารถคุมกำเนิด (10 คะแนน)
•	สามารถคุมกำเนิดได้นาน 3 ปี ถึง 5 ปี แล้วแต่ชนิดของยา (10 คะแนน)
•	ยาฝังชนิด 1 หลอด สามารถคุมกำเนิดได้นาน 3 ปี (5 คะแนน)
•	ยาฝังชนิด 2 หลอด สามารถคุมกำเนิดได้นาน 5 ปี (5 คะแนน)
4.	ผลข้างเคียง (30 คะแนน)
•	เลือดออกกะปริบกระปรอย ประจำเดือนมาไม่สม่ำเสมอ (10 คะแนน)
•	ปวดศีรษะ สิวขึ้น น้ำหนักเพิ่ม (10 คะแนน)
•	ปวดหรือบวมบริเวณที่ฝังยา (10 คะแนน)
•	ผลข้างเคียงเหล่านี้มักเกิดขึ้นในช่วงแรกของการใช้ยาฝัง และจะลดลงหรือหายไปเมื่อร่างกายปรับตัวกับฮอร์โมนในยาได้ (10 คะแนน)
5.	การดูแลตนเองหลังจากการฝังยาคุมกำเนิด (30 คะแนน)
•	รักษาความสะอาดบริเวณแผล ไม่ให้แผลเปียกน้ำ 7 วัน (10 คะแนน)
•	ในช่วงแรกๆ หลีกเลี่ยงการยกของหนัก หลีกเลี่ยงใช้แขนข้างที่ฝังยาทำกิจกรรมหนักๆ เพื่อป้องกันการอักเสบหรือการเคลื่อนตัวของยาฝัง (10 คะแนน)
•	สังเกตอาการบวม แดง ร้อน หรือมีของเหลวไหลออกจากแผล หากพบอาการเหล่านี้ควรปรึกษาแพทย์ทันที (10 คะแนน)
•	เมื่อครบเวลามาเปลี่ยนยาฝังคุมกำเนิดตามกำหนด (10 คะแนน)

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
    //console.log(feedbackJson);
    return feedbackJson;
}
async function processTranscriptionLab6(transcription) {
    const answerKey = `
Lab 6: การทำความสะอาดแผลฝีเย็บ
1.	วิธีการเปลี่ยนผ้าอนามัย (คะแนนเต็ม 40) 
•	เปลี่ยนผ้าอนามัยอย่างน้อยทุกสองชั่วโมง (5) 
•	เปลี่ยนผ้าอนามัยเมื่อรู้สึกชุ่ม เปียกชื้น (5) 
•	เปลี่ยนผ้าอนามัยหลังการขับถ่ายอุจจาระหรือปัสสาวะ (5) 
•	ล้างมือก่อนและหลังเปลี่ยนผ้าอนามัย (5) 
•	จับผ้าอนามัยด้านนอก (10) 
•	ถอดผ้าอนามัยจากด้านหน้าไปด้านหลัง (10) 
•	เวลาใส่ ให้ใส่จากด้านหน้าไปด้านหลัง (10) 
2.	ขั้นตอนและการทำความสะอาดแผลฝีเย็บเมื่อกลับไปอยู่บ้าน (คะแนนเต็ม 40) 
•	สบู่และน้ำเปล่า/สบู่และน้ำสะอาด (10) 
•	ใช้มือถูสบู่แล้วมาฟอกอวัยวะเพศและแผลฝีเย็บเบาๆ (10) 
•	ฟอกจากด้านหน้าไปด้านหลัง (10) 
•	ไม่ฟอกย้อนไปย้อนมา เช็ดให้แห้งจากด้านหน้าไปด้านหลัง (10) 
3.	ลักษณะผิดปกติของแผลฝีเย็บ มีอะไรบ้าง (คะแนนเต็ม 30) 
•	มีอาการปวด บวม แดง (10) 
•	แผลแยก (10) 
•	มีเลือดหรือหนองซึม (10) 
•	กลิ่นเหม็นผิดปกติ (10) 

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
    //console.log(feedbackJson);
    return feedbackJson;
}
async function processTranscriptionLab7(transcription) {
    const answerKey = `
Lab 7: การอาบน้ำทารก
1.	การสังเกตร่างกายทารกก่อนอาบน้ำ (คะแนนเต็ม 40) 
เฉลย 
•	ตา มีขี้ตาแฉะ ตาแดง เปลือกตาบวม (10) 
•	ผิวหนังมีผดผื่นหรือรอยแผล (10) 
•	หายใจหน้าอกบุ๋ม (5) 
•	หน้าท้องโป่งตึง แข็ง (5) 
•	สายสะดือแห้งดี หรือแดงแฉะ (10) 
•	อวัยวะเพศบวม แดง มีสารคัดหลั่งออกมาผิดปกติ หรือมีหนองไหล (10) 
•	ทวารหนักมีแผล หรือผดผื่นรอบรูทวารหนัก (10) 
2.	สิ่งแวดล้อมบริเวณที่อาบน้ำ (คะแนนเต็ม 20) 
เฉลย 
•	ไม่มีลมโกรก (10) 
•	อากาศไม่หนาว (10) 
•	ปิดแอร์ ปิดพัดลม (10) 
•	ใกล้ก๊อกน้ำ (5) 
3.	การเตรียมน้ำอาบทารก (คะแนนเต็ม 40) 
เฉลย 
•	เติมน้ำอุ่นในกะละมัง (10) 
•	ประมาณเศษสองส่วนสามของกะละมัง (10) 
•	น้ำอุ่นพอดี ไม่ร้อนหรือเย็นเกินไป (20) 
•	ใช้หลังมือหรือข้อศอกแตะน้ำเพื่อทดสอบอุณหภูมิ (20) 

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
    //console.log(feedbackJson);
    return feedbackJson;
}
async function processTranscriptionLab8(transcription) {
    const answerKey = `
Lab 8: การทำความสะอาดตาและสายสะดือทารก
1.	อุปกรณ์ทำความสะอาดตาทารก (คะแนนเต็ม 10) 
เฉลย  
•	ก้อนสำลีสะอาด 2 ก้อนหรือมากกว่า (5) 
•	น้ำต้มสุกที่เย็นแล้ว (5) 
•	น้ำสะอาด (5) 
2.	ขั้นตอนการทำความสะอาดตาทารก (คะแนนเต็ม 40) 
เฉลย 
•	ล้างมือให้สะอาด (10) 
•	หยิบก้อนสำลีสองก้อนแล้วประกบกัน (10) 
•	สำลีชุบน้ำบีบให้หมาด (10) 
•	แยกสำลีออก ใช้ด้านในเช็ดจากหัวตาไปหางตาเบา ๆ ทั้งสองข้าง (10) 
•	เปลี่ยนสำลีก้อนใหม่ หากสกปรก เช็ดจนสะอาด (10) 
•	ไม่เช็ดซ้ำไปมา (10) 
3.	อุปกรณ์ทำความสะอาดสายสะดือทารก (คะแนนเต็ม 10) 
เฉลย  
•	แอลกอฮอล์ล้างแผล (10) 
•	น้ำยาโพรวิโดน ไอโอดีน (10) 
•	ไม้พันสำลี 2 อันหรือมากกว่า (10) 
4.	ขั้นตอนการทำความสะอาดสายสะดือทารก (คะแนนเต็ม 40) 
เฉลย  
•	ล้างมือให้สะอาด (5)  
•	จับสายสะดือยกขึ้น (5) 
•	ใช้ไม้พันสำลีชุบแอลกอฮอล์ เช็ดจากขั้วสะดือวนออกด้านนอก (10) 
•	เช็ดจากโคนสะดือขึ้นไปบนสายสะดือโดยรอบ (10) 
•	เช็ดปลายตัดสายสะดือ (10) 
•	เช็ดทำความสะอาดหลังอาบน้ำ (10) 
•	เช็ดทุกวันจนสายสะดือหลุด และขั้วสะดือแห้ง (10) 

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
    //console.log(feedbackJson);
    return feedbackJson;
}
async function processTranscriptionLab9(transcription) {
    const answerKey = `
Lab 9: การส่งเสริมพัฒนาการทารก
เฉลย (100 คะแนน อธิบายในแต่ละข้อได้ข้อละ 20 คะแนน)
1.  การสร้างความสัมพันธ์ทางอารมณ์ (Bonding) เช่น การอุ้มทารก จูบ ลูบหัว พูดคุยกับทารก และการทำกิจกรรมที่สร้างความผูกพันกับทารกเป็นสิ่งสำคัญที่จะช่วยพัฒนาความรู้สึกและความมั่นใจในทารก
วิธีการ คุณแม่สามารถอุ้มทารกแนบตัว จ้องมองตาทารกและพูดคุยด้วยเสียงอ่อนโยน รวมถึงลูบหัวหรือจูบทารกเบาๆ ทำให้ทารกรู้สึกปลอดภัยและอบอุ่น
2. การกระตุ้นด้วยเสียง (Auditory Stimulation) การพูดคุย ร้องเพลง หรือเปิดเพลงเบาๆ ให้ทารกฟัง จะช่วยกระตุ้นพัฒนาการด้านการฟังของทารก
วิธีการ คุณแม่สามารถร้องเพลงหรือเล่านิทานให้ทารกฟัง ใช้เสียงต่างๆ เช่น เสียงธรรมชาติ หรือเสียงของเล่นที่มีเสียงเพื่อให้ทารกฝึกฟังและจดจำเสียง
3. การกระตุ้นด้วยการมองเห็น (Visual Stimulation) การใช้ของเล่นสีสันสดใส หรือการเคลื่อนไหวของวัตถุ จะช่วยกระตุ้นการมองเห็นและการโฟกัสของทารก
วิธีการ คุณแม่สามารถใช้ของเล่นที่มีสีสันสดใส เคลื่อนไหวช้าๆ หน้าเจ้าตัวเล็กเพื่อให้ทารกฝึกการมองตาม หรือแขวนโมบายที่มีสีสันสดใสเหนือเตียงของทารก
4. การกระตุ้นด้วยการสัมผัส (Tactile Stimulation) การลูบตัวทารกเบาๆ หรือการนวดทารก จะช่วยพัฒนาความรู้สึกและการสัมผัสของทารก
วิธีการ คุณแม่สามารถนวดตัวทารกเบาๆ ใช้นิ้วมือถูไล่ไปตามแขนขาของทารก เพื่อให้ทารกได้รับความรู้สึกสัมผัสที่หลากหลาย หรือใช้ผ้าฝ้ายที่นุ่มมาลูบตัวทารก
5. การกระตุ้นการเคลื่อนไหว (Motor Stimulation) การให้ทารกนอนคว่ำในระยะเวลาสั้นๆ เพื่อเสริมสร้างกล้ามเนื้อคอและหลัง หรือการให้ทารกขยับแขนขา จะช่วยพัฒนาการเคลื่อนไหวของทารก
วิธีการ คุณแม่สามารถให้ทารกนอนคว่ำบนพื้นผิวที่นุ่มในช่วงเวลาสั้นๆ เพื่อให้ทารกฝึกยกหัวหรือการเคลื่อนไหวร่างกาย และสามารถเล่นกับทารกโดยให้ทารกจับมือหรือเท้าของคุณแม่แล้วขยับไปมา

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
    //console.log(feedbackJson);
    return feedbackJson;
}
async function processTranscriptionLab10(transcription) {
    const answerKey = `
Lab 10: การสื่อสัญญาณทารก
คำตอบ (100 คะแนน อธิบายในแต่ละข้อได้ข้อละ 20 คะแนน)
1.	การเคลื่อนไหวศีรษะ หันหน้าไปมา หรือมองหาหัวนมเพื่อดูดนม
2.	การเลียริมฝีปาก ทารกอาจจะแสดงพฤติกรรมการเลียริมฝีปากหรือเคลื่อนไหวปาก
3.	การแสดงท่าทางการดูด ทารกจะทำท่าทางดูดหรือเคลื่อนไหวปากในลักษณะดูด
4.	การดูดนิ้ว ถูปาก ทารกจะพยายามนำมือเข้าปากหรือเคลื่อนไหวมือไปที่ปาก หรือถูที่ปาก
5.	ทารกร้องไห้ เมื่อทารกเริ่มร้องไห้ เป็นสัญญาณว่าทารกหิวมากขึ้น

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
    //console.log(feedbackJson);
    return feedbackJson;
}

/*
MATERNAL AND CHILD
--antenatal--
lab 11-15
*/
router.post('/maternalchild-11', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `maternalchild/lab11/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab11(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 11,
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
async function processTranscriptionLab11(transcription) {
    const answerKey = `
สถานการณ์ที่ 11 Initial Prenatal Assessment (เฉลย)

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
    //console.log(feedbackJson);
    return feedbackJson;
}

router.post('/maternalchild-12', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `maternalchild/lab12/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab12(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 12,
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
async function processTranscriptionLab12(transcription) {
    const answerKey = `
สถานการณ์ที่ 12 อาการไม่สุขสบาย (ปวดหลังและตะคริว) (เฉลย)

เฉลย
1.	อธิบายสาเหตุของอาการปวดหลังในสตรีตั้งครรภ์และคำแนะนำในการปฏิบัติตัวที่เหมาะสม
1.1 สาเหตุอาการปวดหลัง เฉลย (20 คะแนน)
	ขนาดของมดลูกและการเปลี่ยนแปลงจุดศูนย์ถ่วง เฉลย (5 คะแนน)
เมื่ออายุครรภ์มากขึ้น มดลูกจะขยายใหญ่ขึ้น ทำให้จุดศูนย์ถ่วงของร่างกายเลื่อนมาข้างหน้าเพื่อรักษาสมดุลของการทรงตัว ส่งผลให้กระดูกสันหลังโค้งงอและหลังแอ่น กล้ามเนื้อหลังต้องทำงานหนักขึ้นเพื่อรองรับน้ำหนักที่เพิ่มขึ้น จึงทำให้เกิดอาการปวดหลัง 
	ฮอร์โมนที่มีผลต่อข้อต่อต่างๆ เฉลย (5 คะแนน)
ฮอร์โมนโปรเจสเตอโรนและรีแล็กซิน (relaxin) ที่เพิ่มขึ้นระหว่างตั้งครรภ์มีผลทำให้ข้อต่อและเอ็นในร่างกายหย่อนตัวลง ซึ่งช่วยเตรียมร่างกายสำหรับการคลอด แต่ก็ทำให้ข้อต่อต่างๆ โดยเฉพาะบริเวณกระดูกเชิงกรานไม่แข็งแรงเท่าที่ควร ทำให้มีโอกาสเกิดอาการปวดหลังได้ง่ายขึ้น 
	ท่าทางการเคลื่อนไหวในชีวิตประจำวัน เฉลย (5 คะแนน)
การเปลี่ยนแปลงของร่างกายที่เกิดขึ้นระหว่างตั้งครรภ์มักส่งผลต่อท่าทางการเคลื่อนไหว การเดิน การยืน หรือการนั่ง สตรีตั้งครรภ์อาจมีการเปลี่ยนแปลงท่าทางโดยไม่รู้ตัว ซึ่งอาจทำให้เกิดความตึงเครียดที่กล้ามเนื้อหลังได้ 
	การทรงตัว เฉลย (5 คะแนน)
เนื่องจากน้ำหนักที่เพิ่มขึ้นและการเปลี่ยนแปลงของจุดศูนย์ถ่วง การทรงตัวอาจลดลงในช่วงตั้งครรภ์ ทำให้สตรีต้องปรับท่าทางเพื่อรักษาความสมดุล ซึ่งการปรับตัวเหล่านี้อาจทำให้กล้ามเนื้อหลังต้องทำงานหนักขึ้น เกิดอาการปวดหลังตามมา 
	ลักษณะงานและกิจกรรมที่ทำระหว่างตั้งครรภ์ เฉลย (5 คะแนน)
ลักษณะงานที่ต้องยืนหรือนั่งนานๆ หรือกิจกรรมที่ต้องใช้แรง เช่น ยกของหนัก มีผลให้กล้ามเนื้อหลังทำงานหนักและเพิ่มความเสี่ยงต่อการปวดหลังในสตรีตั้งครรภ์ (5 คะแนน)
	1.2 คำแนะนำในการปฏิบัติตัวและการบรรเทาอาการปวดหลัง เฉลย (30 คะแนน)
	หลีกเลี่ยงการยืนนานๆ หากต้องยืนนาน ควรหาที่พักเท้าข้างหนึ่งให้สูงขึ้นเล็กน้อยสลับกัน 
	การนั่ง ควรเลือกเก้าอี้ที่มีพนักพิงที่รองรับหลัง และวางหมอนเล็กๆ ไว้ที่เอว และเปลี่ยนท่านั่งทุกๆ 30 นาที 
	แนะนำให้นอนตะแคง โดยให้หมอนรองระหว่างขา 
	การหยิบของจากพื้น ควรนั่งย่อเข่าลงแทนการก้มตัวและพยายามให้หลังตรง
	หลีกเลี่ยงการยกของหนัก 
	ไม่สวมรองเท้าส้นสูง 
	นวดหรือประคบร้อนบริเวณที่ปวด 
	สวมใส่ผ้าหรือกางเกงพยุงหน้าท้อง หรือ girdle 
	บริหารร่างกายอยู่ในท่าคลาน (pelvic rocking) โดยวางมือและเข่าบนพื้น หายใจเข้าพร้อมกับโก่งหลังขึ้น และหายใจออกพร้อมกับแอ่นหลัง ทำซ้ำประมาณ 5-10 ครั้ง 


2.	อธิบายสาเหตุการเกิดตะคริวในสตรีตั้งครรภ์และคำแนะนำในการปฏิบัติตัวที่เหมาะสม
2.1	สาเหตุอาการปวดหลัง เฉลย (20 คะแนน)
	ปริมาณแคลเซียมในเลือดลดต่ำลง เฉลย (5 คะแนน)
ระหว่างตั้งครรภ์ สตรีตั้งครรภ์อาจมีปริมาณแคลเซียมในเลือดที่ลดต่ำลง เนื่องจากทารกต้องการแคลเซียมไปพัฒนาอวัยวะและโครงกระดูก การขาดแคลเซียมนี้เป็นปัจจัยที่ทำให้เกิดตะคริวในกล้ามเนื้อได้
	การดึงสารอาหารจากสตรีตั้งครรภ์เพื่อการเจริญเติบโตของทารกในครรภ์ (5 คะแนน)
ทารกในครรภ์ดึงสารอาหารต่างๆ จากแม่ รวมถึงแคลเซียมและแร่ธาตุสำคัญไปใช้ในการพัฒนาร่างกาย การดึงสารอาหารนี้อาจทำให้แม่ขาดแร่ธาตุที่จำเป็น จึงเกิดอาการตะคริวได้ง่ายขึ้น
	การเสียสมดุลของแคลเซียมและฟอสฟอรัสในร่างกาย (5 คะแนน)
การตั้งครรภ์ทำให้เกิดการเปลี่ยนแปลงในสมดุลของแร่ธาตุต่างๆ โดยเฉพาะแคลเซียมและฟอสฟอรัส ซึ่งหากเสียสมดุลนี้อาจนำไปสู่อาการตะคริวในกล้ามเนื้อได้
	การกดทับเส้นประสาทบริเวณต้นขาจากมดลูกที่ขยายใหญ่ขึ้น (5 คะแนน)
เมื่อมดลูกขยายตัวตามการเจริญเติบโตของทารก อาจไปกดทับเส้นประสาทบริเวณต้นขา ทำให้เกิดอาการตะคริวหรือปวดกล้ามเนื้อในบริเวณขาได้
	การอยู่ในท่าเดียวนานๆ (5 คะแนน)
การยืนนั่งหรืออยู่ในท่าใดท่าหนึ่งนานๆ โดยไม่เคลื่อนไหวอาจทำให้กล้ามเนื้อเมื่อยล้าและเกิดอาการตะคริวได้ง่ายเกิดจากปริมาณแคลเซียมในเลือดลดต่ำลง 
2.2	คำแนะนำในการปฏิบัติตัวและการบรรเทาอาการตะคริว เฉลย (30 คะแนน)
	เหยียดขาและกระดกปลายเท้าเพื่อคลายกล้ามเนื้อ
แนะนำให้นั่งเหยียดขาข้างที่มีอาการตะคริวให้ตรง กดหัวเข่าให้ข้อพับแนบกับพื้นและกระดกปลายเท้าเข้าหาลำตัวให้มากที่สุดจนน่องตึง ช่วยคลายกล้ามเนื้อบริเวณน่อง 
	บริหารขาและเท้าอย่างสม่ำเสมอ
ออกกำลังกายและบริหารขาและเท้าเพื่อเสริมความแข็งแรงของกล้ามเนื้อและลดความเสี่ยงในการเกิดตะคริว 
	ทำท่า Calf Stretch เพื่อยืดกล้ามเนื้อน่อง
การยืดกล้ามเนื้อน่องด้วยท่า Calf Stretch ช่วยคลายความตึงและลดอาการตะคริวได้ 
	ยืดกล้ามเนื้อขณะยืนเพื่อบรรเทาอาการตะคริว
ขณะยืน เหยียดขาข้างที่เป็นตะคริวไปข้างหน้า งอเข่าเล็กน้อยและย่อตัวลง เกร็งกล้ามเนื้อไว้จนกว่าอาการจะดีขึ้น จากนั้นกระดกปลายเท้าเข้าหาตัวอย่างช้าๆ 
	ลงน้ำหนักที่ส้นเท้าและยกปลายเท้าขึ้น
ยืนลงน้ำหนักที่ส้นเท้าและยกปลายเท้าขึ้นเพื่อช่วยลดอาการตะคริวบริเวณน่อง 
	รับประทานอาหารที่มีแคลเซียมสูง
ควรรับประทานอาหารที่มีแคลเซียมมาก เช่น นมเสริมแคลเซียม ไข่แดง ปลาไส้ตัน และปลาเล็กปลาน้อย เพื่อเสริมสร้างความแข็งแรงของกระดูกและกล้ามเนื้อ 
	หลีกเลี่ยงการนั่งไขว่ห้างและการยืนนานๆ
การนั่งไขว่ห้างหรือยืนนานๆ อาจเพิ่มความเสี่ยงในการเกิดตะคริว ควรเปลี่ยนท่าทางบ่อยๆ และหลีกเลี่ยงการนั่งหรือยืนนานเกินไป (5 คะแนน)

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
    //console.log(feedbackJson);
    return feedbackJson;
}

router.post('/maternalchild-13', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `maternalchild/lab13/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab13(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 13,
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
async function processTranscriptionLab13(transcription) {
    const answerKey = `
สถานการณ์ที่ 13 การตรวจครรภ์ (ปวดหลังและตะคริว) (เฉลย)

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
    //console.log(feedbackJson);
    return feedbackJson;
}

router.post('/maternalchild-14', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `maternalchild/lab14/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab14(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 14,
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
async function processTranscriptionLab14(transcription) {
    const answerKey = `
สถานการณ์ที่ 14 คำแนะนำผลตรวจ GCT และ OGTT ในสตรีตั้งครรภ์ และเฉลย

เฉลย
1. พยาบาลควรอธิบายผลการตรวจ GCT ว่าอย่างไร 
เฉลย (20 คะแนน) 
•	ผลการตรวจ GCT (Glucose Challenge Test) สูงกว่าปกติ อาจมีภาวะเบาหวานขณะตั้งครรภ์ (Gestational Diabetes) ควรได้รับการตรวจเพิ่มเติม (10 คะแนน)
•	GCT หากมีค่าต่ำกว่า 140 mg/dL ถือว่าปกติ แต่ถ้าค่ามากกว่า 140 ต้องได้รับการตรวจ OGTT (oral glucose tolerance test) เพิ่มเติม (10 คะแนน)
•	ค่าน้ำตาลในเลือดสูงกว่าปกติ ต้องตรวจด้วยวิธีอื่นเพิ่มเติม (5 คะแนน)
2. พยาบาลควรอธิบายผลการตรวจ OGTT ว่าอย่างไร
เฉลย (30 คะแนน) 
•	มีภาวะเบาหวานขณะตั้งครรภ์ (Gestational Diabetes) (20 คะแนน)
•	มีภาวะเบาหวานชนิด A1 (30 คะแนน)
•	มีภาวะเบาหวานไม่รุนแรง สามารถรักษาโดยการควบคุมอาหาร ไม่ต้องได้รับยา (10 คะแนน)

3. พยาบาลจะแนะนำการปฏิบัติตัวเกี่ยวกับการรับประทานอาหารอย่างไร
เฉลย  (50 คะแนน)
•	รับประทานอาหารมื้อหลัก 3 มื้อ และอาหารว่าง 2-3 มื้อเล็กๆ ต่อวัน (5 คะแนน)
•	รับประทานคาร์โบไฮเดรตที่มีเส้นใยสูง เช่น ข้าวกล้อง, ข้าวโอ๊ต, ขนมปังโฮลเกรน, ถั่ว, ธัญพืชต่าง ๆ (10 คะแนน) 
•	หลีกเลี่ยงอาหารประเภทแป้งที่ผ่านการขัดขาว เช่น ข้าวขาว, ขนมปังขาว, ขนมอบที่มีน้ำตาลสูง (10 คะแนน) 
•	หลีกเลี่ยงอาหารรสหวานหรือมีไขมันสูง (5 คะแนน)
•	รับประทานผักที่มีเส้นใยสูง เช่น บร็อคโคลี่, ผักใบเขียว, แครอท, และฟักทอง (10 คะแนน)
•	รับประทานผักสดหรือผักสุกที่ไม่ผ่านการปรุงรสด้วยน้ำตาลหรือซอสที่มีน้ำตาลสูง (5 คะแนน)
•	รับประทานโปรตีน เช่น เนื้อไก่ไม่ติดหนัง, ปลา, ไข่, เต้าหู้, ถั่วลิสง, ถั่วเมล็ดแห้ง (10 คะแนน)
•	หลีกเลี่ยงเนื้อสัตว์ที่มีไขมันสูง เช่น เนื้อวัวหรือเนื้อหมูที่มีมันติด และอาหารทอด (5 คะแนน)
•	หลีกเลี่ยงการรับประทานขนม หรือเครื่องดื่มรสหวาน เช่น ขนมหวาน, ขนมอบที่มีน้ำตาลสูง, น้ำอัดลม, น้ำผึ้ง, น้ำหวาน, น้ำผลไม้เข้มข้น (10 คะแนน)
•	รับประทานผลไม้ที่มีน้ำตาลต่ำและมีเส้นใยสูง เช่น ฝรั่ง, แอปเปิล, แพร์, ส้ม, เบอร์รี่ต่าง ๆ (10 คะแนน)
•	หลีกเลี่ยงผลไม้ที่มีน้ำตาลสูง เช่น เงาะ, องุ่น, กล้วยหอม, มะม่วงสุก (10 คะแนน)
•	รับประทานผลไม้สดแทนผลไม้แปรรูปหรือน้ำผลไม้เข้มข้น (5 คะแนน)


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
    //console.log(feedbackJson);
    return feedbackJson;
}

router.post('/maternalchild-15', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `maternalchild/lab15/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab15(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 15,
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
async function processTranscriptionLab15(transcription) {
    const answerKey = `
สถานการณ์ที่ 15 คำแนะนำการบริหารร่างกายในระยะตั้งครรภ์ และเฉลย

เฉลย
1. อธิบายประโยชน์ของการบริหารร่างกาย เฉลย (20 คะแนน) 
•	ส่งเสริมการไหลเวียนเลือด (5 คะแนน)
•	ช่วยให้ออกซิเจนและเลือดไปเลี้ยงส่วนต่างๆ ของร่างกายและทารกได้ดีขึ้น (5 คะแนน)
•	การทำงานของหัวใจและระบบหายใจดีขึ้น (5 คะแนน)
•	การเผาผลาญสารอาหารเพิ่มขึ้น ระดับน้ำตาลและไขมันในเลือดลดลง ป้องกันภาวะเบาหวานระหว่างตั้งครรภ์ (5 คะแนน)
•	ระบบการย่อยอาหารทำงานได้ดีขึ้น ช่วยป้องกันและบรรเทาอาการท้องผูก (5 คะแนน)
•	เสริมสร้างความแข็งแรงของกล้ามเนื้อพื้นเชิงกราน กระดูก เอ็นและข้อต่างๆ (5 คะแนน)
•	ช่วยรองรับน้ำหนักตัวที่เพิ่มขึ้น (5 คะแนน)
•	ช่วยให้มีสุขภาพจิตดี ลดความเครียด นอนหลับได้ดี (5 คะแนน)

2. อธิบายข้อห้ามในการบริหารร่างกาย เฉลย (20 คะแนน) 
•	มีเลือดออกจากช่องคลอด (5 คะแนน)
•	เจ็บครรภ์คลอดก่อนกำหนด (5 คะแนน)
•	มีภาวะแทรกซ้อน เช่น โรคความดันโลหิตสูงที่ควบคุมไม่ได้ หรือโรคหัวใจ (5 คะแนน)
•	ขณะออกกำลังกาย ชีพจนเกิน 140 ครั้งต่อนาที (5 คะแนน)
•	ถุงน้ำคร่ำรั่ว ซึม (5 คะแนน)
•	ทารกดิ้นน้อยหรือไม่ดิ้น (5 คะแนน)

3. อธิบายวิธีบริหารร่างกายท่าต่างๆ ในระยะตั้งครรภ์ เฉลย (60 คะแนน)
3.1	บริหารขาและเท้า (20 คะแนน)
•	ช่วยให้การไหลเวียนโลหิตบริเวณอวัยวะส่วนปลายดีขึ้น ลดอาการบวม ป้องกันเส้นเลือดขอด (5 คะแนน)
•	การหมุนข้อเท้า (foot rotation) : นั่งบนเก้าอี้หรือที่นั่งที่มั่นคง หมุนปลายเท้า เป็นวงกลมช้าๆ แล้วเปลี่ยนทิศทางหมุนไปทางขวาและซ้าย สลับกัน (20 คะแนน)
•	กระดกปลายเท้าขึ้นลง : นั่งเหยียดขาตรง ปลายเท้าแยกกันเล็กน้อย หายใจเข้านับ 1 พร้อมกับกระดกปลายเท้าทั้งสองขึ้น หายใจออก นับ 2 พร้อมกับกดปลายเท้าลง (20 คะแนน)

3.2 บริหารกล้ามเนื้อไหล่และลำคอ เฉลย (20 คะแนน)
•	ช่วยลดความตึงเครียดและความเมื่อยล้า ป้องกันอาการปวดหลังส่วนบน (5 คะแนน)
•	ท่าหมุนหัวไหล่: นั่งหรือยืนตรง ปล่อยแขนลงข้างลำตัว หมุนหัวไหล่ไปข้างหลังเป็นวงกลมช้าๆ 10-15 รอบ แล้วหมุนย้อนไปข้างหลัง 10-15 รอบ พร้อมการหายใจเข้าออกเป็นจังหวะช้าๆ (10 คะแนน)
•	ท่าหมุนหัวไหล่: นั่งหรือยืนตรง มือสองข้างจับหัวไหล่ไว้แล้วหมุนหัวไหล่ไปข้างหลังเป็นวงกลมช้าๆ 10-15 รอบ แล้วหมุนย้อนไปข้างหลัง 10-15 รอบ พร้อมการหายใจเข้าออกเป็นจังหวะช้าๆ (10 คะแนน) 
•	ท่าหมุนคอ: นั่งหรือยืนตรง ผ่อนคลายไหล่ หันศีรษะช้าๆ จากซ้ายไปขวา ทำ 5 รอบ แล้วหันกลับจากขวาไปซ้ายอีก 5 รอบ ทำพร้อมการหายใจเข้า ออกช้าๆ (10 คะแนน)
•	ท่าหมุนคอ: นั่ง หรือยืนตรง ผ่อนคลายไหล่ ตะแคงศีรษะไปทางซ้ายและขวา สลับกันช้าๆ พร้อมกับการหายใจเข้า ออก ช้าๆ (10 คะแนน)
•	อยู่ในท่านั่งหรือยืน ผ่อนคลายไหล่ทั้งสองข้าง นับ 1 หายใจเข้าพร้อมกับยกไหล่ทั้งสองข้างขึ้น เกร็งค้างไว้สักครู่ แล้วหายใจออกพร้อมกับวางไหล่ให้ผ่อนคลาย ทำ 10 รอบ (shoulder lifting) (10 คะแนน)

3.3	บริหารกล้ามเนื้ออุ้งเชิงกราน เฉลย (20 คะแนน)
•	ช่วยยืดขยายข้อต่ออุ้งเชิงกราน พื้นที่เชิงกรานแข็งแรง ยืดหยุ่นดี ช่วยให้คลอดง่าย (5 คะแนน)
•	ขมิบช่องคลอด รูทวารหนัก และช่องปัสสาวะ (kegel exercise) เป็นจังหวะช้าๆ ตามการหายใจเข้า ออก (10 คะแนน) 
•	นั่งขัดสมาธิ ปลายเท้าชนกัน มือสองข้างวางที่เข้า ดันเข่าขึ้นพร้อมการหายใจเข้า และกดเข่าลงพร้อมการหายใจออก (butterfly) (10 คะแนน)

3.4 บริหารกล้ามเนื้อหลังและสะโพก เฉลย (20 คะแนน)
•	ช่วยป้องกันและบรรเทาอาการปวดหลังส่วนล่าง ลดความตึงตัวของกล้ามเนื้อหลังส่วนล่างและตะโพก (5 คะแนน)
•	ท่า Pelvic Tilt (การเอียงกระดูกเชิงกราน): ยืนพิงกำแพง โดยงอเข่าเล็กน้อย วางเท้าห่างจากกำแพงประมาณหนึ่งฝ่ามือ เกร็งกล้ามเนื้อหน้าท้อง กดหลังส่วนล่างให้ชิดกับกำแพง ค้างไว้ 5-10 วินาที แล้วผ่อนคลาย ทำซ้ำ 10-15 ครั้ง ช่วยเสริมสร้างความแข็งแรงของกล้ามเนื้อหลังส่วนล่างและสะโพก (10 คะแนน)
•	ท่า Hip Flexor Stretch (ยืดกล้ามเนื้อสะโพก): ท่าคุกเข่า วางเข่าข้างหนึ่งไว้บนพื้นและงอเข่าอีกข้างหนึ่งเป็นมุมฉาก 90 องศา ค่อยๆ โน้มตัวไปข้างหน้าโดยให้สะโพกอยู่ในท่าตรง ค้างไว้ 20-30 วินาที แล้วสลับข้าง ทำซ้ำ 3-5 ครั้ง ช่วยยืดกล้ามเนื้อสะโพก ลดความตึงเครียด (10 คะแนน)
•	Pelvic rocking: อยู่ในท่าคลาน หายใจเข้า พร้อมกับก้มหน้าเอาคางชิดอก โก่งหลังขึ้น (คล้ายแมวขู่) ค้างไว้สักครู่ แล้วหายใจออกพร้อมกับวางหลังลง ผ่อนคลาย ทำ 10 รอบ (10 คะแนน)

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
    //console.log(feedbackJson);
    return feedbackJson;
}

/*
MATERNAL AND CHILD
--intra-partum--
lab 16-20
*/

router.post('/maternalchild-16', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `maternalchild/lab16/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab16(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 16,
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
async function processTranscriptionLab16(transcription) {
    const answerKey = `
สถานการณ์ที่ 16 คำแนะนำการบริหารร่างกายในระยะตั้งครรภ์ และเฉลย

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
    //console.log(feedbackJson);
    return feedbackJson;
}

router.post('/maternalchild-17', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `maternalchild/lab17/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab17(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 17,
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
async function processTranscriptionLab17(transcription) {
    const answerKey = `
สถานการณ์ที่ 17 การประเมินองค์ประกอบการคลอด (5P) และเฉลย

เฉลย
1.	ประเมินองค์ประกอบการคลอด (5P) ของผู้คลอดรายนี้ว่ามีความผิดปกติหรือไม่อย่างไร พร้อมอธิบายเหตุผล เฉลย (70 คะแนน) 
•	Power หมายถึง แรงที่ใช้ในการช่วยให้ทารกเคลื่อนต่ำ แบ่งได้เป็น 2 ส่วนคือ
1)	Primary power ประเมินจากการหดรัดตัวของมดลูก 
Interval อยู่ในช่วง 5 นาที เหมาะสมในผู้คลอดที่อยู่ในระยะปากมดลูกเปิดช้า 
Duration อยู่ในช่วง 40 วินาที เหมาะสมในผู้คลอดที่อยู่ในระยะปากมดลูกเปิดช้า
Intensity อยู่ระดับ moderate intensity เหมาะสมในผู้คลอดที่อยู่ในระยะปากมดลูกเปิดช้า
	ซึ่งผู้คลอดรายนี้ มี duration interval intensity อยู่ในเกณฑ์ปกติ 
2)	Secondary power เกิดจากการหดรัดตัวของกล้ามเนื้อหน้าท้อง ทรวงอก และ
กระบังลม ส่งผลให้เกิดความดันภายในช่องท้องมากขึ้น เป็นแรงดันที่เกิดขึ้นภายหลัง (secondary force or secondary power) 

ในท้ายของระยะที่ 1 ของการคลอด แต่ผู้คลอดรายนี้ ยังอยู่ในระยะปากมดลูกเปิดช้า หรือ latent phase จึงจะยังไม่มีแรงในส่วนนี้เกิดขึ้น ดังนั้น การประเมิน power จึงหมายถึง การหดรัดตัวของมดลูกเป็นสำคัญ (15 คะแนน)
 
•	Passage หมายถึง หนทางคลอด แบ่งได้เป็น 2 ส่วนคือ 
1)	Bony passage เป็นส่วนที่แข็งและยืดขยายได้น้อย ได้แก่ กระดูกเชิงกราน 
ลักษณะของช่องเชิงกราน ของผู้คลอดรายนี้เป็น ชนิด Gynecoid เป็นลักษณะเชิงกรานที่คลอดง่ายที่สุด เพราะลักษณะของเชิงกรานช่วยส่งเสริมการก้มของศีรษะ ทารกและทำให้ศีรษะมีการหมุนได้ดี แต่ในส่วนของ ischial spine ยังไม่สามารถประเมินได้ 
	    2)  Soft passage เป็นช่องทางคลอดที่เป็นกล้ามเนื้อและเนื้อเยื่อ ได้แก่ มดลูกส่วนล่าง ปากมดลูก ช่องคลอด กล้ามเนื้ออุ้งเชิงกราน และฝีเย็บ 

ซึ่งผู้คลอดรายนี้ มีอายุ 20 ปี และปฏิเสธประวัติการผ่าตัดเกี่ยวกับกระดูกอุ้งเชิงกราน/อุบัติเหตุเกี่ยวกับกระดูกอุ้งเชิงกราน ประเมินลักษณะช่องเชิงกรานตามแนวของ Caldwell-Moloy classification พบว่าเป็นแบบ Gynecoid อยู่ในเกณฑ์ปกติ ส่วนปากมดลูกยังเปิด 3 เซนติเมตร อาจยังระบุความผิดปกติยังไม่ได้ (15 คะแนน)

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
    //console.log(feedbackJson);
    return feedbackJson;
}

router.post('/maternalchild-18', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `maternalchild/lab18/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab18(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 18,
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
async function processTranscriptionLab18(transcription) {
    const answerKey = `
สถานการณ์ที่ 18 การดูแลในระยะที่ 1 ของการคลอด (ระยะคลอด) และเฉลย

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
    //console.log(feedbackJson);
    return feedbackJson;
}

router.post('/maternalchild-19', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `maternalchild/lab19/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab19(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 19,
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
async function processTranscriptionLab19(transcription) {
    const answerKey = `
สถานการณ์ที่ 19 การพยาบาลในระยะที่ 2 ของการคลอด (ระยะคลอด) และเฉลย

เฉลย
1.	จะพิจารณาย้ายผู้คลอดรายนี้ไปยังห้องคลอดหรือไม่ พร้อมอธิบายเหตุผล  เฉลย (30 คะแนน) 
•	ย้ายผู้คลอดรายนี้ไปยังห้องคลอด (10 คะแนน) 
•	ผู้คลอดมีแนวโน้มที่ปากมดลูกเปิดหมด เนื่องจากพบ bloody show  (10 คะแนน)
•	มดลูกหดรัดตัวถี่ Interval 2 นาที Duration 50 วินาที Strong Intensity (10 คะแนน)
•	ผู้คลอดบอกว่า “ปวดถ่าย อยากจะเบ่ง อั้นไม่ไหว” (10 คะแนน)
•	ควรตรวจภายในเพื่อประเมินการเข้าสู่ระยะที่สองของการคลอด  (10 คะแนน)

2.	ท่านจะให้การพยาบาล และสาธิตวิธีหายใจ holding breathing, pushing breathing ในระยะที่ 2 ของการคลอด ให้แก่ผู้คลอดรายนี้อย่างไร เฉลย (70 คะแนน) 
	การดูแลความสุขสบายและการจัดสิ่งแวดล้อม 
ให้การช่วยเหลือการเช็ดหน้าเช็ดตัวด้วยผ้าชุบน้ำเย็นบ่อยๆ จัดสิ่งแวดล้อมให้อากาศถ่ายเทได้ดี เงียบสงบ ดูแลให้ผ้าปูที่นอนสะอาดและแห้ง (5 คะแนน)
	ดูแลให้ผู้คลอดอยู่ในท่าที่เหมาะสม
ท่าที่เหมาะสมจะช่วยให้ผู้คลอดสุขสบายขึ้นและมีการเคลื่อนต่ำของศีรษะทารกเร็วขึ้น ท่าที่เหมาะสมในระยะที่สองของการคลอด คือ ท่าศีรษะสูง (upright position) ได้แก่ ท่านั่ง ท่าศีรษะสูงกว่า 45 องศาจากพื้นราบ นั่งของๆ นั่งคุกเข่า หรือท่าคลาน ทำให้การเบ่งมีประสิทธิภาพมากขึ้น (5 คะแนน)
	ดูแลให้ได้รับสารน้ำทางหลอดเลือดดำทดแทน 
การได้รับอาหารและน้ำทางปาก อาจจะทำให้ผู้คลอดเกิดอาการอาเจียนและสำลักได้ จึงต้องงดให้อาหารและน้ำ (5 คะแนน)
	ดูแลกระเพาะปัสสาวะให้ว่าง 
เพื่อส่งเสริมให้การหดรัดตัวของมดลูก และการเคลื่อนต่ำของศีรษะทารก ถ้ากระเพาะปัสสาวะเต็มควรกระตุ้นให้ผู้คลอดพยายามถ่ายปัสสาวะเอง ถ้าถ่ายเองไม่ได้ควรสวนปัสสาวะให้ตามความจำเป็น (10 คะแนน)
	ดูแลบรรเทาความเจ็บปวด
ควรจัดให้ผู้คลอดนอนตะแคง และช่วยนวดบริเวณก้นกบ โดยใช้สันมือนวดลึกๆ เป็นวงกลมด้วยแรงกดคงที่สม่ำเสมอ ไม่กดลึกจนเกินไป ในรายที่จำเป็นต้องใช้เครื่องมือในการช่วยคลอด เช่น คีม เครื่องดูดสุญญากาศ เป็นต้น ส่วนใหญ่แพทย์จะให้ยาระงับความเจ็บปวดโดยทำ Pudendal nerve block เป็นวิธีที่เหมาะสมและปลอดภัย (10 คะแนน)
	ให้กำลังใจแก่ผู้คลอด
บอกให้ผู้คลอดทราบว่า การคลอดใกล้จะสิ้นสุดลงแล้ว พร้อมทั้งย้ำถึงวิธีการเบ่งอย่างมีประสิทธิภาพ (5 คะแนน)
	หลีกเลี่ยงการดันหน้าท้อง
เนื่องจากทำให้เกิดอันตรายต่อมดลูก หรือมดลูกแตกได้ อีกทั้งผู้คลอดได้รับความเจ็บปวดจากการถูกดันหน้าท้อง เมื่อเปรียบเทียบกับการไม่ได้ถูกดันหน้าท้องด้วย (5 คะแนน)
	ประเมินสภาวะของผู้คลอดและสุขภาพของทารกในครรภ์
ตรวจสอบสัญญาณชีพของมารดาและทารกอย่างสม่ำเสมอ (5 คะแนน)
	เตรียมอุปกรณ์ที่จำเป็นสำหรับการรับเด็ก เช่น กรรไกรตัดสายสะดือ Top gauze ฯลฯ (5 คะแนน)
	แนะนำเบ่งคลอดอย่างมีประสิทธิภาพ (30 คะแนน)
	เบ่งเมื่อปากมดลูกเปิดหมด และส่วนนำเคลื่อนต่ำ มากดบริเวณพื้นเชิงกราน (10 คะแนน) 
	จัดให้ผู้คลอดอยู่ในท่าที่ศีรษะและลำตัวสูง มือทั้งสอง ข้างจับที่ข้างเตียง หรือสอดไว้ใต้เข่าตรงข้อพับ ขณะมดลูกเริ่มหดรัดตัวผู้คลอดรู้สึกอยากเบ่งให้ผู้คลอดหายใจเข้าลึกๆยาวๆ 1-2 ครั้ง (10 คะแนน) 
	สูดหายใจเข้าเต็มที่ กลั้นหายใจไว้พร้อมทั้งก้มหน้าคลังชิดอก ลำตัวงอเป็นลูกตัว C เบ่งลงทางช่องคลอด คล้ายกับการเบ่งถ่ายอุจจาระ เบ่งแต่ละครั้ง 6 ถึง 8 วินาที โดยมดลูกหดรัดตัวแต่ละครั้งให้แบ่งได้อย่างน้อย 4 ครั้ง หลังเบ่งเสร็จแต่ละครั้งให้ หายใจเข้าออก แล้วสูดหายใจเข้าใหม่แล้วเบ่งครั้งถัดไป จนกว่าศีรษะของทารกจะคลอด (10 คะแนน)
	อย่าปล่อยให้ผู้คลอดเบ่งนานเกินไป
	การเบ่งนานเกินไปอาจทำให้ผู้คลอดเหนื่อยล้า และอาจส่งผลให้ทารกขาดออกซิเจนได้ (10 คะแนน)
	สังเกตอาการผิดปกติ หากพบอาการผิดปกติ เช่น หัวใจของทารกเต้นผิดจังหวะ มารดาเสียเลือดมาก หรือมีอาการเจ็บปวดรุนแรง ให้แจ้งแพทย์ทันที (10 คะแนน)

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
    //console.log(feedbackJson);
    return feedbackJson;
}

router.post('/maternalchild-20', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `maternalchild/lab20/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionLab20(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 20,
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
async function processTranscriptionLab20(transcription) {
    const answerKey = `
สถานการณ์ที่ 20 การพยาบาลในระยะที่ 3 ของการคลอด และเฉลย

เฉลย
1.	จะประเมินการลอกตัวของรกในผู้คลอดรายนี้อย่างไร พร้อมอธิบายเหตุผล เฉลย (30 คะแนน)
อาการแสดงการลอกตัวของรก ภายหลังจากทารกเกิดแล้ว รกจะลอกตัวจากผนังมดลูก โดยทั่วไปจะมีอาการแสดงของการลอกตัวของรกเกิดขึ้นภายใน 5 นาที ดังนี้
1.	อาการแสดงของมดลูก (uterine sign) (10 คะแนน) คือ มดลูกจะเปลี่ยนรูปร่างจากแบนเป็นกลม ขนาดจะเล็กลง มดลูกจะหดตัวแข็งภายหลังจากรกลอกตัวแล้ว เนื่องจากภายหลังทารกคลอด ตำแหน่งของมดลูกจะสูงขึ้นเหนือระดับสะดือประมาณ 0.5 เซนติเมตร เคลื่อนไหวไปมาได้สะดวก เพราะไม่ได้อยู่ในช่องเชิงกราน ลักษณะหน้าท้องเป็นสองลอน ส่วนมากลอนบนจะมีลักษณะแข็งเพราะเป็นมดลูกและเอียงไปทางขวา เนื่องจากทางซ้ายเป็นลำไส้ ส่วนลอนล่างจะมีลักษณะนิ่มเพราะเป็นรก
2.	อาการแสดงของสายสะดือ (Cord sign) (10 คะแนน) คือ สายสะดือจะเคลื่อนต่ำลงมาประมาณ 3 นิ้ว ในขณะที่มดลูกหดรัดตัวแข็งและมีการลอกตัวของรก สังเกตได้จากเชือกที่ผูกสายสะดือไว้ชิดกับช่องคลอดจะเลื่อนต่ำลงมาจากตำแหน่งเดิม สายสะดือที่บิดเป็นเกลียวจะคลายออก คลำไม่พบการเต้นของชีพจร เมื่อโกยมดลูกขึ้นข้างบนเชือกที่ผูกสายสะดือจะไม่ตามขึ้นไป
3.	อาการแสดงของที่พบทางช่องคลอด (Cord sign) (10 คะแนน) คือ จะมีเลือดออกมาให้เห็นทางช่องคลอด ประมาณ 30-60 ซี.ซี. แต่อาการแสดงนี้ไม่แน่นอนเพราะการมีเลือดออกมาไม่ได้หมายความว่ารกมีการลอกตัวที่สมบูรณ์ เพียงแต่แสดงว่ารกมีการลอกตัวเท่านั้น พบได้ในรายที่รกลอกตัวทางขอบล่าง (Matthews Duncan’s method) ส่วนในรายที่รกเริ่มลอกตัวตรงกลาง (Schultze’s method) จะไม่มีเลือดออกมาให้เห็น 

2.	จะตัดสินใจทำคลอดรกเลยหรือไม่ พร้อมอธิบายเหตุผล เฉลย (20 คะแนน)
•	ยังไม่ทำคลอดรก (10 คะแนน)  
•	สามารถรอประเมินการลอกตัวของรกได้อีก 25 นาที เนื่องจากยังไม่พบสัญญานรกลอกตัว (10 คะแนน) ระยะเวลาในระยะที่ 3 ของการคลอด ซึ่งนับตั้งแต่หลังทารกคลอดมาจนกระทั่งรกและเยื่อหุ้มรกคลอด โดยเฉลี่ยใช้เวลา 5-15 นาที แต่ไม่ควรเกิน 30 นาที ถ้าเกิน 30 นาที เรียกว่า มีระยะที่ 3 ของการคลอดยาวนาน (prolong 3rd stage of labor)

 
3.	จะตัดสินใจทำคลอดรกเมื่อใด อธิบายเหตุผล พร้อมอธิบายวิธีการทำคลอดรกแบบ Modified Crede’ Maneuver เฉลย (50 คะแนน)
•	จะทำคลอดรกเมื่อพบว่ารกลอกตัวสมบูรณ์แล้ว (10 คะแนน)
•	วิธีการตรวจสอบว่ารกลอกตัวสมบูรณ์แล้ว ทดสอบโดยการโกยมดลูบริเวณหัวหน่าวขึ้นไปแล้วสังเกตการเคลื่อนตัวของสายสะดือ หากสายสะดือไม่เคลื่อนตาม แสดงว่ารกลอกตัวสมบูรณ์แล้ว (10 คะแนน)
•	การทำคลอดรกแบบ Modified Crede’ Maneuver (30 คะแนน) เป็นวิธีที่นิยมปฏิบัติมากและผู้คลอดจะปลอดภัยมากที่สุด มีหลักการคลอดรกโดยอาศัยมดลูกส่วนบนที่หดรัดตัวแข็งดันเอารกที่อยู่ส่วนล่างของช่องคลอดออกมา โดยให้ผู้ทำคลอดปฏิบัติดังนี้ 
1.	ผู้ทำคลอดต้องเปลี่ยนตำแหน่งการยืนมาอยู่ด้านตรงข้าม ใช้มือข้างที่ถนัดคลึงมดลูกให้หดรัดตัวดียิ่งขึ้น ป้องกันมดลูกปลิ้นขณะทำคลอดรก เมื่อมดลูกแข็งตัวดีแล้ว ผลักมดลูกที่กลมแข็ง และยังไปทางด้านขวา ให้มาอยู่ตรงกลางของช่องท้อง วางมือทำมุม 30 องศากับแนวดิ่ง ขนาดกับกระดูกก้นกบ (promontory of sacrum) จากนั้นใช้อุ้งมือดันยอดมดลูกลงมา มดลูกส่วนบนที่แข็งจะดันให้รกซึ่งอยู่ในมดลูกส่วนล่างเคลื่อนออกมา การดันมดลูกห้ามดันไปในทิศทางของช่องเชิงกรานตรงๆ เพราะจะทำให้เกิดมดลูกปลิ้นได้ ห้ามใช้นิ้วมือบีบผนังด้านหน้าและหลังของมดลูกเข้าหากัน (วิธีแบบเดิมของ Crede’) เพราะอาจทำให้เกิดอันตรายต่อมดลูกได้ แต่ให้ใช้กำลังผลักดันจากอุ้งมือเท่านั้น 
2.	ขณะที่มือด้านที่ผลักมดลูก มืออีกข้างต้องคอยรองรับทารกที่คลอดออกมา เมื่อรกคลอดออกมาประมาณ 2/3 ให้ปฏิบัติดังนี้ 
2.1	มือข้างที่ดันมดลูกลงมาเปลี่ยนเป็นโกยมดลูกส่วนบนขึ้นไปเพื่อเป็นการช่วยดึงรั้งให้เยื่อหุ้มทารกที่เกาะอยู่บริเวณส่วนล่างของมดลูกมีการลอกตัว วิธีโกยมดลูกขึ้นใช้ปลายนิ้วทั้ง 4 สอดเข้าไปที่ผนังหน้าท้อง บริเวณเหนือหัวหน่าวให้ลึกพอแล้วโกยส่วนบนของมดลูกขึ้นไป 
2.2	มือข้างที่รองรับรกไว้ ต้องคอยพยุงไม่ให้รกถ่วงลงมามากเพราะจะทำให้เยื่อหุ้มรกที่ออกมายังไม่หมดขาดได้ 
2.3	หลังจากรกคลอดออกมาแล้ว ใช้มือข้างที่โกยมดลูกขึ้นเปลี่ยนมาช่วยประคองรกร่วมกับมือด้านที่รองรับรกอยู่ก่อน แล้วหมุนรกไปรอบๆทางเดียวต่อเนื่องกัน จนกว่ารกและเยื่อหุ้มรกจะคลอดออกมาหมด เพื่อช่วยให้เยื่อหุ้มรกรอบตัวได้ดีขึ้น และไม่ขาดจากกัน การหมุนควรหมุนให้ห่างจากปากช่องคลอดและรูทวารหนัก เพราะจะทำให้เกิดการปนเปื้อนเชื้อและติดเชื้อได้ 
2.4	หลังจากรกและเยื่อหุ้มทารกคลอดออกมาหมดแล้ว ดูเวลารกคลอดและรีบตรวจรกว่าครบหรือไม่ กรณีไม่ครบ ห้ามคลึงมดลูกให้ตรวจหาเศษรกที่ค้างอยู่ในมดลูกก่อน เพราะจะทำให้มดลูกหดรัดตัวดีมากและปากมดลูกตีบแคบลง การตรวจหาเศษรกที่ตกค้างจะทำได้ลำบาก เป็นสาเหตุให้มดลูกหดรัดตัวได้ไม่ดีและเกิดภาวะตกเลือดในระยะหลังคลอดได้ เมื่อตรวจสอบว่ารกครบแล้ว ให้ช่วยคลึงมดลูกให้ห่วงรับตัวแข็งและผักมดลูกเพื่อไล่ก้อนเลือดที่ค้างอยู่ในโพรงมดลูกออกมา 

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
    //console.log(feedbackJson);
    return feedbackJson;
}

// 315
router.post('/315-1', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `subject315/lab1/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionSubject315Lab1(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 1,
            subject: '315',
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
async function processTranscriptionSubject315Lab1(transcription) {
    const answerKey = `
สถานการณ์ที่ 1
โจทย์:
มารดาครรภ์ที่ 3 หลังคลอด 2 วัน ซักถามเกี่ยวกับอาการปวดมดลูก และก้อนที่คลำพบบริเวณหน้าท้อง ให้นักศึกษาแนะนำมารดารายนี้เกี่ยวกับการเปลี่ยนแปลงของมดลูกที่เกิดขึ้นภายหลังคลอด (โดยอธิบายเกี่ยวกับการกลับคืนสู่สภาพเดิม การลดระดับของมดลูก และอาการปวดมดลูก)

เฉลย
คำถาม
1.	การกลับคืนสู่สภาพเดิม (10 คะแนน)
คำตอบ
เกิดขึ้นทันทีภายหลังจากรกคลอด เกิดจาก 3 ขบวนการ คือ 
1.1) การหดรัดตัวของใยกล้ามเนื้อมดลูก (5 คะแนน)
1.2) ขบวนการย่อยสลาย (5 คะแนน)
1.3) การสร้างเยื่อบุโพรงมดลูกใหม่ (5 คะแนน)

คำถาม
2.	การลดระดับของมดลูก (50 คะแนน)
คำตอบ
2.1)	ทันทีหลังรกคลอด มดลูกจะสามารถคลำได้เป็นก้อนแข็งในแนวกลางลำตัว โดยอยู่กึ่งกลางระหว่างหัวหน่าวกับสะดือ หรือประมาณ 2 เซนติเมตรต่ำกว่าระดับสะดือ (10)
2.2)	ภายใน 12 ชั่วโมงหลังคลอด ยอดมดลูกจะลอยสูงขึ้นไปอยู่ระดับสะดือหรือสูงกว่าระดับสะดือเล็กน้อย และจะคงอยู่ระดับนี้นานประมาณ 24 ชั่วโมง (10)
2.3)	ระดับมดลูกลดลงวันละประมาณ 1-2 เซนติเมตร (10)
2.4)	วันที่ 6 หลังคลอดจะคลำยอดมดลูกได้ประมาณกึ่งกลางระหว่างหัวหน่าวกับสะดือ (10)
2.5)	วันที่ 10 หลังคลอดจะคลำยอดมดลูกไม่ได้ทางหน้าท้อง (10)
2.6)	ขนาดและรูปร่างของมดลูกจะใกล้เคียงกับก่อนตั้งครรภ์ประมาณสัปดาห์ที่ 6 (10)

คำถาม
3.	อาการปวดมดลูก (50 คะแนน)
คำตอบ
3.1)	อาการปวดมดลูกหลังคลอด เป็นอาการปกติที่พบได้ใน 2-3 วันแรกหลังคลอด และจะค่อยๆหายไปในวันที่ 3-7 หลังคลอด (15)
3.2)	สาเหตุเกิดจากการหดรัดตัวและคลายตัวของมดลูกสลับกัน มักจะพบอาการปวดมากในมารดาที่กล้ามเนื้อมดลูกมีการยืดขยายมากกว่าปกติ (15) 

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
    //console.log(feedbackJson);
    return feedbackJson;
}

router.post('/315-2', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `subject315/lab2/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionSubject315Lab2(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 2,
            subject: '315',
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
async function processTranscriptionSubject315Lab2(transcription) {
    const answerKey = `
สถานการณ์ที่ 2
โจทย์:
มารดาหลังคลอดปกติทางช่องคลอด 12 ชั่วโมง แผลฝีเย็บฉีกขาดระดับ 3 ประเมิน REEDA score = 7 (R=2, E=2, Ec=2, D=0, A=1) ปวดแผลฝีเย็บระดับ 8 ให้นักศึกษาแนะนำมารดารายนี้เกี่ยวกับการทำความสะอาดแผลฝีเย็บ การใช้ผ้าอนามัย และการบรรเทาปวดแผลฝีเย็บ

เฉลย
คำถาม
1.  การทำความสะอาดแผลฝีเย็บ (30 คะแนน)
คำตอบ
•	แนะนำมารดาให้ล้างมือให้สะอาดก่อนและหลังทำความสะอาดทุกครั้ง เพื่อป้องกันการติดเชื้อที่แผลฝีเย็บและแผลในโพรงมดลูก (15)
•	แนะนำมารดาให้ชำระอวัยวะสืบพันธุ์ภายนอกและแผลฝีเย็บด้วยตนเองอย่างถูกวิธี โดยใช้สบู่และน้ำสะอาดทำความสะอาดภายหลังการขับถ่ายทุกครั้ง ล้างจากด้านหน้าไปด้านหลัง ป้องกันเชื้อจากทวารหนักเข้าสู่แผลฝีเย็บและแผลในโพรงมดลูก (15)

คำถาม
2.	การใช้ผ้าอนามัย  (30 คะแนน)
คำตอบ
•	แนะนำการใช้ผ้าอนามัยที่ถูกวิธี จับผ้าอนามัยด้านที่ไม่ได้สัมผัสอวัยวะสืบพันธุ์ ใส่และถอดผ้าอนามัยจากด้านหน้าไปด้านหลัง ใส่ให้กระชับ ไม่เลื่อนไปมา เพราะอาจนำเชื้อโรคจากทวารหนักมายังช่องคลอดได้ เปลี่ยนเมื่อรู้สึกว่าเปียกชุ่ม และไม่ควรใช้ผ้านอนามัยแบบสอด เพราะอาจทำให้เกิดการติดเชื้อได้ (30)

คำถาม
3.	การบรรเทาปวดแผลฝีเย็บ (40 คะแนน)
คำตอบ
•	ใน 24 ชั่วโมงแรกหลังคลอด ประคบบริเวณฝีเย็บด้วยความเย็น หรือให้นั่งแช่ก้นในน้ำเย็น ความเย็นจะทำให้เนื้อเยื่อมีอาการชา หลอดเลือดหดตัว ลดอาการมีเลือดออก และลดอาการบวม ประคบนานครั้งละประมาณ 20 นาที หลังจากนั้นพัก 10 นาทีก่อนเริ่มประคบครั้งต่อไป ไม่ควรประคบ cold pack โดยการสัมผัสกับบริเวณผิวหนังฝีเย็บโดยตรง ควรใช้ผ้าห่อก่อนนำไปประคบ เพื่อป้องกันการบาดเจ็บจาก cold burn (20)
•	แนะนำให้มารดาหลังคลอดเกร็งกล้ามเนื้อแก้มก้น ก่อนนั่งบนพื้นผิวที่แข็ง เพื่อแก้มก้นจะช่วยผ่อนน้ำหนักที่จะกดบริเวณฝีเย็บ (15)

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
    //console.log(feedbackJson);
    return feedbackJson;
}

router.post('/315-3', authMiddleware, async (req, res) => {
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
        fileUrl = await uploadToSpaces(finalFilePath, `subject315/lab3/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);
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
        // const transcriptionResult = await transcribeAudioIApp(audioPath);
        // const transcription = concatenateTranscriptionText(transcriptionResult.output);
        const transcription = await transcribeAudioOpenAI(audioPath);

        // GPT processing (same as before)
        // console.time('GPT processing');
        const feedbackJson = await processTranscriptionSubject315Lab3(transcription);
        // console.timeEnd('GPT processing');

        // Prepare and submit lab info
        const labInfo = {
            studentId: req.userId,
            labNumber: 3,
            subject: '315',
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
async function processTranscriptionSubject315Lab3(transcription) {
    const answerKey = `
สถานการณ์ที่ 3
โจทย์:
มารดาหลังคลอดปกติ 1 วัน หัวนมทั้ง 2 ข้างยาว 0.5 cm น้ำนมยังไม่ไหล พยายามให้ลูกดูดนมตนเองแต่ยังทำไม่ได้ พยาบาลเข้าไปประเมินผลว่า บุตรอมไม่ลึกถึงลานนม ไม่ได้ยินเสียงกลืน อุ้มบุตรดูดนมไม่ถูกวิธี บ่นเจ็บหัวนมขณะที่บุตรดูดนมมาก ให้นักศึกษาประเมิน LATCH score ของมารดารายนี้ และจากนั้นให้แนะนำการดูดนมที่ถูกวิธีแก่มารดารายนี้ (ตั้งแต่การนำทารกเข้าเต้า ไปจนถึงการนำทารกออกจากเต้านม) (100)

เฉลย
คำถาม
1.	ประเมิน LATCH score (50 คะแนน)
คำตอบ
LATCH score = 4 คะแนน ต้องได้รับการช่วยเหลือ (10)
-	Latch = 1 คะแนน บุตรอมไม่ลึกถึงลานนม (10)
-	Audible = 0 คะแนน ไม่ได้ยินเสียงกลืน (10)
-	Type of nipple = 2 คะแนน หัวนมทั้ง 2 ข้างยาว 0.5 cm (10)
-	Comfort = 1 คะแนน เจ็บหัวนมขณะที่บุตรดูดนมมาก (10)
-	Hold = 0 คะแนน อุ้มบุตรดูดนมไม่ถูกวิธี พยายามให้ลูกดูดนมตนเองแต่ยังทำไม่ได้ (10)

คำถาม
2.	แนะนำการดูดนมที่ถูกวิธี (50 คะแนน)
คำตอบ
2.1)	แนะนำจัดท่าที่สบาย อุ้มลูกหันหน้าเข้าหาเต้านม ท้องมารดาแนบกับท้องลูก (10)
2.2)	แนะนำใช้หมอนรองใต้ท้องแขนมารดา ให้ปากลูกอยู่ระดับเดียวกับหัวนม อุ้มลูกโดยรองรับทั้งตัว ศีรษะและลำตัวลูกอยู่ในแนวตรง คอไม่บิด ศีรษะสูงกว่าลำตัวเล็กน้อย (10)
2.3)	แนะนำใช้มือประคองเต้านมในท่า C hold/ U hold (10)
2.4)	เมื่อลูกอ้าปากกว้าง ให้นำลูกเข้าเต้าด้วยความรวดเร็วและนุ่มนวล (10)
2.5)	ขณะดูดนม ปากลูกอ้ากว้างแนบสนิทกับเต้านมมารดา ริมฝีปากล่างบานออกคล้ายปากปลา (10)
2.6)	เมื่อต้องการเปลี่ยนข้างดูด ให้ใช้นิ้วก้อยสอดเข้าไประหว่างมุมปากกับหัวนม/ใช้มือกดคางลูกเบาๆ (10)


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
    //console.log(feedbackJson);
    return feedbackJson;
}

module.exports = router;