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
    const ext = path.extname(fileName).toLowerCase();
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
        const transcriptionResult = await transcribeAudioIApp(audioPath);
        // console.timeEnd('Transcription');

        const transcription = concatenateTranscriptionText(transcriptionResult.output);

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

router.post('/upload-1', authMiddleware, async (req, res) => {
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
        const transcriptionResult = await transcribeAudioIApp(audioPath);
        // console.timeEnd('Transcription');

        const transcription = concatenateTranscriptionText(transcriptionResult.output);

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
router.post('/upload-2', authMiddleware, async (req, res) => {
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

        // Transcription
        // console.time('Transcription');
        const transcriptionResult = await transcribeAudioIApp(audioPath);
        // console.timeEnd('Transcription');

        const transcription = concatenateTranscriptionText(transcriptionResult.output);

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
router.post('/upload-3', authMiddleware, async (req, res) => {
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

        // Transcription
        // console.time('Transcription');
        const transcriptionResult = await transcribeAudioIApp(audioPath);
        // console.timeEnd('Transcription');

        const transcription = concatenateTranscriptionText(transcriptionResult.output);

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
router.post('/upload-4', authMiddleware, async (req, res) => {
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

        // Transcription
        // console.time('Transcription');
        const transcriptionResult = await transcribeAudioIApp(audioPath);
        // console.timeEnd('Transcription');

        const transcription = concatenateTranscriptionText(transcriptionResult.output);

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
router.post('/upload-5', authMiddleware, async (req, res) => {
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

        // Transcription
        // console.time('Transcription');
        const transcriptionResult = await transcribeAudioIApp(audioPath);
        // console.timeEnd('Transcription');

        const transcription = concatenateTranscriptionText(transcriptionResult.output);

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
router.post('/upload-6', authMiddleware, async (req, res) => {
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

        // Transcription
        // console.time('Transcription');
        const transcriptionResult = await transcribeAudioIApp(audioPath);
        // console.timeEnd('Transcription');

        const transcription = concatenateTranscriptionText(transcriptionResult.output);

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
router.post('/upload-7', authMiddleware, async (req, res) => {
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

        // Transcription
        // console.time('Transcription');
        const transcriptionResult = await transcribeAudioIApp(audioPath);
        // console.timeEnd('Transcription');

        const transcription = concatenateTranscriptionText(transcriptionResult.output);

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
router.post('/upload-8', authMiddleware, async (req, res) => {
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

        // Transcription
        // console.time('Transcription');
        const transcriptionResult = await transcribeAudioIApp(audioPath);
        // console.timeEnd('Transcription');

        const transcription = concatenateTranscriptionText(transcriptionResult.output);

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
router.post('/upload-9', authMiddleware, async (req, res) => {
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

        // Transcription
        // console.time('Transcription');
        const transcriptionResult = await transcribeAudioIApp(audioPath);
        // console.timeEnd('Transcription');

        const transcription = concatenateTranscriptionText(transcriptionResult.output);

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
router.post('/upload-10', authMiddleware, async (req, res) => {
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

        // Transcription
        // console.time('Transcription');
        const transcriptionResult = await transcribeAudioIApp(audioPath);
        // console.timeEnd('Transcription');

        const transcription = concatenateTranscriptionText(transcriptionResult.output);

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

module.exports = router;