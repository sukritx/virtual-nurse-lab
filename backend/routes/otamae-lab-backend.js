const express = require('express');
const router = express.Router();
const path = require('path');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const OpenAI = require('openai');
const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { ElevenLabsClient } = require("@elevenlabs/elevenlabs-js");

const { authMiddleware } = require('../middleware');
const { otamaeAnswerKeys } = require('./otamae-answer-keys');

require('dotenv').config();

ffmpeg.setFfmpegPath(ffmpegPath);

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

const elevenlabs = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY,
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
    if (process.env.LOCAL_DEV === 'true') {
        const localUrl = `/uploads/${path.basename(filePath)}`;
        console.log("Local dev mode - skipping Spaces upload, serving from:", localUrl);
        return localUrl;
    }

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

async function transcribeAudioElevenLabs(audioPath) {
    try {
        console.log('==============================================');
        console.log('Starting ElevenLabs transcription for:', audioPath);
        console.log('==============================================');

        // Check if file exists and get its size
        const stats = fs.statSync(audioPath);
        console.log('Audio file size:', stats.size, 'bytes');

        // Use the official ElevenLabs SDK
        const audioData = fs.createReadStream(audioPath);

        console.log('Calling ElevenLabs SDK speechToText.convert with model: scribe_v2...');

        // Use the SDK's speechToText.convert method
        const result = await elevenlabs.speechToText.convert({
            file: audioData,
            modelId: "scribe_v2",
        });

        console.log('ElevenLabs raw result type:', typeof result);
        console.log('ElevenLabs raw result:', JSON.stringify(result, null, 2));

        // Handle response according to ElevenLabs documentation
        // The response should have 'text' field containing the transcription
        if (!result) {
            console.warn('ElevenLabs returned empty response');
            throw new Error('Empty response from ElevenLabs');
        }

        // Extract transcription text from response
        let transcriptionText = '';

        if (typeof result === 'string') {
            transcriptionText = result;
        } else if (result && typeof result === 'object') {
            // According to docs, response has 'text' field
            transcriptionText = result.text || result.transcription || result.content || JSON.stringify(result);
        } else {
            transcriptionText = String(result);
        }

        if (!transcriptionText || transcriptionText.trim() === '') {
            console.warn('ElevenLabs returned empty transcription text');
            throw new Error('Empty transcription text from ElevenLabs');
        }

        console.log('Extracted transcription:', transcriptionText.substring(0, 200) + '...');
        console.log('==============================================');
        console.log('ElevenLabs transcription SUCCESS');
        console.log('==============================================');

        return transcriptionText;
    } catch (error) {
        console.error('==============================================');
        console.error('ELEVENLABS TRANSCRIPTION ERROR');
        console.error('==============================================');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Status Text:', error.response.statusText);
            console.error('Response Headers:', JSON.stringify(error.response.headers));
            console.error('Response Data:', JSON.stringify(error.response.data));
        }
        console.error('==============================================');
        console.log('ElevenLabs transcription failed. Falling back to OpenAI Whisper...');
        console.log('==============================================');

        // Fallback to OpenAI Whisper
        try {
            console.log('Starting OpenAI Whisper fallback...');
            const fallbackResult = await transcribeAudioOpenAI(audioPath);
            console.log('OpenAI Whisper fallback SUCCESS');
            return fallbackResult;
        } catch (fallbackError) {
            console.error('Fallback also failed:', fallbackError.message);
            throw new Error(`Transcription failed: ElevenLabs - ${error.message}, Fallback - ${fallbackError.message}`);
        }
    }
}

async function evaluateOtamae(transcription, answerKey, language) {
    const checkContentEN = `
You are an experienced nursing instructor evaluating a nursing student's clinical performance. Please assess the student's answer from 'Student Response' against the 'Key Answer and Scoring Rubric' in detail.

**Evaluation Principles:**
1.  **Comparison:** Compare the student's answer focusing on the meaning and correctness of content against the 'Key Answer and Scoring Rubric', not just exact vocabulary matching.
2.  **Scoring:** The 'Key Answer and Scoring Rubric' has sub-items with points in parentheses (e.g., (10), (5)). Determine whether each item in the key answer is present in the student's response.
    *   If the item is present and completely correct: award full points for that item.
    *   If the item is present but incomplete or partially incorrect: award partial points as appropriate (e.g., half the points for that item).
    *   If the item is absent: award zero points for that item.
3.  **Total Score Calculation:** Calculate 'totalScore' from the sum of points awarded for each sub-item in the key answer.
4.  **Pros:** Identify key items from the 'Key Answer and Scoring Rubric' that the student answered correctly, clearly, and completely, explaining why they did well. Include the point value of each item in parentheses, e.g., (15 points).
5.  **Recommendations:** Identify key items from the 'Key Answer and Scoring Rubric' that the student answered incompletely, inaccurately, or missed entirely, providing specific suggestions for improvement. Include the point value of each item in parentheses, e.g., (15 points).
6.  **Note:** Do not comment on grammar, spelling, or other issues unrelated to nursing content. Also, do not penalize the student for automatic speech-to-text transcription errors; evaluate the nursing content only.

Student Response: "${transcription}".
Key Answer: "${answerKey}".

**Output Format:**
Please generate the evaluation result in JSON format only:
    {
      "totalScore": <student's score>,
      "pros": "<what the student did well>",
      "recommendations": "<recommendations for improvement>"
    }
`;

    const checkContentJA = `
あなたは経験豊富な看護学教員で、看護学生の臨床実技を評価しています。「学生の回答」を「模範解答・採点ルーブリック」と照らし合わせて詳細に評価してください。

**評価原則:**
1.  **比較:** 単語の完全一致だけでなく、内容の意味と正確性に焦点を当てて、学生の回答を「模範解答・採点ルーブリック」と比較してください。
2.  **採点:** 「模範解答・採点ルーブリック」には括弧付きの点数を持つ小項目があります（例：（10）、（5））。各項目が学生の回答に含まれているかを判定してください。
    *   項目が完全に正しく含まれている場合：その項目に満点を与える。
    *   項目が含まれているが不完全または一部不正確な場合：適切な部分点を与える（例：その項目の半分の点数）。
    *   項目が含まれていない場合：その項目は0点とする。
3.  **合計点の計算:** 各小項目で与えた点数の合計から 'totalScore' を計算してください。
4.  **良かった点（pros）:** 「模範解答・採点ルーブリック」のうち、学生が正しく・明確に・完全に答えられた重要な項目を挙げ、なぜ良かったかを説明してください。各項目の点数を括弧で示してください（例：（15点））。
5.  **改善点（recommendations）:** 学生の回答が不完全・不正確・欠落していた重要な項目を挙げ、次回の改善のための具体的なアドバイスをしてください。各項目の点数を括弧で示してください（例：（15点））。
6.  **注意:** 文法・綴りなど、看護内容と無関係な点については言及しないでください。また、音声認識による自動文字起こしの誤りは減点の対象にせず、看護の内容のみで評価してください。

学生の回答: "${transcription}"。
模範解答: "${answerKey}"。

**出力形式:**
評価結果をJSON形式のみで生成してください：
    {
      "totalScore": <学生の得点>,
      "pros": "<学生が良くできた点>",
      "recommendations": "<改善のためのアドバイス>"
    }
`;

    const checkContent = language === 'en' ? checkContentEN : checkContentJA;

    const response = await openai.chat.completions.create({
        messages: [{ role: "system", content: checkContent }],
        model: "gpt-4o",
        response_format: { "type": "json_object" }
    });

    const feedbackJson = JSON.parse(response.choices[0].message.content.trim());
    console.log(feedbackJson);
    return feedbackJson;
}

const OTAMAE_LAB_COUNT = 10;

for (let labNumber = 1; labNumber <= OTAMAE_LAB_COUNT; labNumber++) {
    router.post(`/otamae/${labNumber}`, authMiddleware, async (req, res) => {
        const { fileName, totalChunks, language } = req.body;
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

            const uploadTimestamp = Date.now();

            fileType = getFileType(fileName);

            // Upload the original file to Spaces
            fileUrl = await uploadToSpaces(finalFilePath, `otamae/lab${labNumber}/${req.userId}/${uploadTimestamp}${path.extname(fileName)}`);

            if (fileType === 'video') {
                // Audio extraction for transcription
                audioPath = `./public/uploads/audio-${uploadTimestamp}.mp3`;
                await new Promise((resolve, reject) => {
                    ffmpeg(finalFilePath)
                        .output(audioPath)
                        .audioCodec('libmp3lame')
                        .on('end', resolve)
                        .on('error', reject)
                        .run();
                });
            } else {
                // For audio files, use the uploaded file directly
                audioPath = finalFilePath;
            }

            // Transcription ElevenLabs
            const transcription = await transcribeAudioElevenLabs(audioPath);

            // GPT processing
            const answerKeyData = otamaeAnswerKeys[labNumber];
            const answerKey = language === 'en' ? answerKeyData.en : answerKeyData.ja;
            const feedbackJson = await evaluateOtamae(transcription, answerKey, language);

            const totalScore = Math.min(100, feedbackJson.totalScore);

            // Prepare and submit lab info
            const labInfo = {
                studentId: req.userId,
                labNumber: labNumber,
                subject: 'otamae',
                fileUrl: fileUrl,
                fileType: fileType,
                studentAnswer: transcription,
                studentScore: totalScore,
                isPass: totalScore >= 60,
                pros: feedbackJson.pros,
                recommendations: feedbackJson.recommendations,
            };

            await axios.post('http://localhost:3000/api/v1/lab-deployed/submit-lab', labInfo);

            // Send response
            res.json({
                feedback: feedbackJson,
                transcription,
                passFailStatus: totalScore >= 60 ? 'Passed' : 'Failed',
                score: totalScore,
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
            if (process.env.LOCAL_DEV !== 'true') {
                [finalFilePath, audioPath].forEach(path => {
                    if (path && process.env.LOCAL_DEV !== 'true' && fs.existsSync(path)) {
                        try {
                            fs.unlinkSync(path);
                        } catch (deleteError) {
                            if (deleteError.code !== 'ENOENT') {
                                console.error(`Failed to delete file: ${path}`, deleteError);
                            }
                        }
                    }
                });
            }
        }
    });
}

module.exports = router;
