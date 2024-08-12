import React, { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import { FaVideo, FaStop, FaRedo, FaCheck, FaUpload } from 'react-icons/fa';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { useAuth } from '../context/AuthContext';

const MAX_RECORDING_TIME = 180; // 3 minutes in seconds
const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

const Lab3Recording = () => {
    const [recordingState, setRecordingState] = useState('initial');
    const [recordedBlob, setRecordedBlob] = useState(null);
    const [timeElapsed, setTimeElapsed] = useState(0);
    const [loading, setLoading] = useState(false);
    const [passFailStatus, setPassFailStatus] = useState('');
    const [score, setScore] = useState('');
    const [pros, setPros] = useState('');
    const [recommendations, setRecommendations] = useState('');
    const [error, setError] = useState('');
    const [isMediaRecorderSupported, setIsMediaRecorderSupported] = useState(true);
    const { token } = useAuth();
    const [uploadProgress, setUploadProgress] = useState(0);

    const mediaRecorderRef = useRef(null);
    const liveVideoRef = useRef(null);
    const recordedVideoRef = useRef(null);
    const streamRef = useRef(null);
    const timerRef = useRef(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        setIsMediaRecorderSupported(typeof MediaRecorder !== 'undefined');
    }, []);

    const videoConstraints = {
        width: { ideal: 640, max: 1280 },
        height: { ideal: 480, max: 720 },
        facingMode: "user"
    };

    const getMimeType = () => {
        const types = [
            'video/webm;codecs=vp8,opus',
            'video/webm',
            'video/mp4',
        ];
        for (let type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return '';
    };

    const startCamera = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: videoConstraints,
                audio: true
            });
            streamRef.current = stream;
            if (liveVideoRef.current) {
                liveVideoRef.current.srcObject = stream;
            }
            setRecordingState('ready');
        } catch (err) {
            setError('Error accessing camera: ' + err.message);
            setIsMediaRecorderSupported(false);
        }
    }, []);

    const startRecording = useCallback(() => {
        const mimeType = getMimeType();
        if (!mimeType) {
            setError('No supported MIME type found for this browser');
            return;
        }

        const mediaRecorder = new MediaRecorder(streamRef.current, {
            mimeType,
            videoBitsPerSecond: 600000 // 600 Kbps
        });
        mediaRecorderRef.current = mediaRecorder;
        
        const chunks = [];
        mediaRecorder.ondataavailable = (event) => chunks.push(event.data);
        mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: mimeType });
            setRecordedBlob(blob);
            if (recordedVideoRef.current) {
                recordedVideoRef.current.src = URL.createObjectURL(blob);
            }
        };
        
        mediaRecorder.start(1000); // Capture in 1-second intervals
        setRecordingState('recording');
        setTimeElapsed(0);
        
        timerRef.current = setInterval(() => {
            setTimeElapsed((prevTime) => {
                if (prevTime >= MAX_RECORDING_TIME) {
                    stopRecording();
                    return MAX_RECORDING_TIME;
                }
                return prevTime + 1;
            });
        }, 1000);
    }, []);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && recordingState === 'recording') {
            mediaRecorderRef.current.stop();
            clearInterval(timerRef.current);
            setRecordingState('recorded');
        }
    }, [recordingState]);

    const retakeRecording = useCallback(() => {
        setRecordedBlob(null);
        setTimeElapsed(0);
        setRecordingState('ready');
    }, []);

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            setRecordedBlob(file);
            setRecordingState('recorded');
            if (recordedVideoRef.current) {
                recordedVideoRef.current.src = URL.createObjectURL(file);
            }
        }
    };

    const onSubmit = useCallback(async () => {
        if (!recordedBlob) return;

        setLoading(true);
        setError('');
        setUploadProgress(0);

        try {
            const totalChunks = Math.ceil(recordedBlob.size / CHUNK_SIZE);
            const fileName = `lab3_recording_${Date.now()}.${recordedBlob.type.split('/')[1]}`;

            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                const start = chunkIndex * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, recordedBlob.size);
                const chunk = recordedBlob.slice(start, end);

                const formData = new FormData();
                formData.append('chunk', chunk);
                formData.append('fileName', fileName);
                formData.append('chunkIndex', chunkIndex);
                formData.append('totalChunks', totalChunks);

                await axios.post('/api/v1/lab-deployed/upload-chunk', formData, {
                    headers: { 
                        'Content-Type': 'multipart/form-data',
                        'Authorization': `Bearer ${token}`
                    }
                });

                setUploadProgress(((chunkIndex + 1) / totalChunks) * 100);
            }

            const response = await axios.post('/api/v1/lab-deployed/upload-3', {
                fileName,
                totalChunks
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            setPassFailStatus(response.data.passFailStatus);
            setScore(response.data.score);
            setPros(response.data.pros);
            setRecommendations(response.data.recommendations);
        } catch (error) {
            if (error.response) {
                setError(`Error uploading video: ${error.response.data.msg || error.response.statusText}`);
            } else if (error.request) {
                setError('Network error. Please check your connection and try again.');
            } else {
                setError('Error uploading video: ' + error.message);
            }
        } finally {
            setLoading(false);
        }
    }, [recordedBlob, token]);

    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, []);

    return (
        <div className="bg-white min-h-screen flex flex-col items-center justify-center py-12">
            <div className="w-full max-w-2xl p-8">
                <div className="mb-6 text-center">
                    <a 
                        href="/student/dashboard" 
                        className="inline-flex items-center justify-center space-x-2 bg-gray-200 text-gray-700 px-4 py-2 rounded-full hover:bg-gray-300 transition duration-300"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                        <span>Back to Dashboard</span>
                    </a>
                </div>

                <h1 className="text-2xl font-bold mb-2 text-center text-gray-800">Lab 3: การเลี้ยงลูกด้วยนมแม่</h1>
                <h2 className="text-lg mb-6 text-center text-gray-600">เต้านมคัดตึง</h2>

                <div className="mb-6 p-4 bg-gray-100 rounded-lg text-sm text-gray-700">
                    <p className="mb-2">
                        มารดาหลังคลอด 7 วัน มาปรึกษาที่คลินิกนมแม่ เนื่องจากเต้านมข้างขวาแข็งตึง กดเจ็บ น้ำนมข้างขวาไหลน้อยลง และลูกดูดนมข้างขวาไม่ได้มา 2 วัน
                    </p>
                    <p className="mb-2">
                        <strong>ตรวจร่างกายพบ</strong> เต้านมและลานนมข้างขวาแข็ง ตึง กดเจ็บ คลำไม่พบก้อน น้ำนมไหล 1-2 หยด ส่วนเต้านมข้างซ้ายปกติ น้ำนมไหลดี
                    </p>
                    <p>
                        <strong>ข้อมูลจากการซักประวัติ</strong> มารดาถนัดให้ลูกดูดนมข้างซ้ายมากกว่าข้างขวา แต่ละมื้อที่ให้นมลูกจะดูดนมข้างเดียว ส่วนเต้านมอีกข้างที่ลูกไม่ได้ดูด ไม่ได้บีบน้ำนมออก เพราะเสียดายน้ำนมจะเก็บเอาไว้ให้ลูกกินมื้อถัดไป หลังจากดูดนมลูกจะหลับนาน 2-3 ชั่วโมง
                    </p>
                </div>

                <div className="mb-6 rounded-3xl overflow-hidden border-4 border-purple-900 shadow-lg">
                    <video 
                        controls 
                        className="w-full"
                        src="/questionVideos/situation3.mp4"
                    >
                        Your browser does not support the video tag.
                    </video>
                </div>

                <div className="flex justify-center mb-4">
                    <a 
                        href="/library/1" 
                        className="inline-flex items-center justify-center space-x-2 bg-gradient-to-r from-blue-700 to-blue-900 text-white text-lg font-semibold px-8 py-3 rounded-full hover:from-blue-800 hover:to-blue-950 transition duration-300 shadow-lg"
                    >
                        <span>ขั้นตอนการใช้งาน</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </a>
                </div>
                
                <div className="space-y-4 mb-8 text-gray-700">
                    <p>1. ท่านจะให้คำแนะนำใดแก่มารดารายนี้ เพื่อบรรเทาอาการคัดตึงเต้านมก่อนให้ลูกดูดนม ขณะลูกดูดนม และหลังจากลูกดูดนม</p>
                </div>
                
                <div className="mb-6">
                    <label className="block mb-2 text-sm font-medium text-gray-700">
                        {isMediaRecorderSupported ? "Record your response (480p)" : "Upload your response"}
                    </label>
                    <div className="mt-1 flex flex-col items-center justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                        {recordingState !== 'recorded' && isMediaRecorderSupported && (
                            <video 
                                ref={liveVideoRef} 
                                className="w-full mb-4" 
                                autoPlay 
                                muted 
                                playsInline
                                style={{transform: 'scaleX(-1)'}}
                            />
                        )}
                        {recordingState === 'recorded' && (
                            <video 
                                ref={recordedVideoRef} 
                                className="w-full mb-4" 
                                controls
                                playsInline
                            />
                        )}
                        <div className="flex space-x-2 mb-4">
                            {isMediaRecorderSupported ? (
                                <>
                                    {recordingState === 'initial' && (
                                        <button
                                            onClick={startCamera}
                                            className="bg-blue-500 text-white px-4 py-2 rounded-full flex items-center"
                                        >
                                            <FaVideo className="mr-2" />
                                            Ready
                                        </button>
                                    )}
                                    {recordingState === 'ready' && (
                                        <button
                                            onClick={startRecording}
                                            className="bg-red-500 text-white px-4 py-2 rounded-full flex items-center"
                                        >
                                            <FaVideo className="mr-2" />
                                            Start Recording
                                        </button>
                                    )}
                                    {recordingState === 'recording' && (
                                        <button
                                            onClick={stopRecording}
                                            className="bg-gray-500 text-white px-4 py-2 rounded-full flex items-center"
                                        >
                                            <FaStop className="mr-2" />
                                            Stop Recording
                                        </button>
                                    )}
                                </>
                            ) : (
                                <button
                                    onClick={() => fileInputRef.current.click()}
                                    className="bg-blue-500 text-white px-4 py-2 rounded-full flex items-center"
                                >
                                    <FaUpload className="mr-2" />
                                    Upload Video
                                </button>
                            )}
                            {recordingState === 'recorded' && (
                                <>
                                    <button
                                        onClick={retakeRecording}
                                        className="bg-yellow-500 text-white px-4 py-2 rounded-full flex items-center"
                                    >
                                        <FaRedo className="mr-2" />
                                        Retake
                                    </button>
                                    <button
                                        onClick={onSubmit}
                                        className="bg-green-500 text-white px-4 py-2 rounded-full flex items-center"
                                    >
                                        <FaCheck className="mr-2" />
                                        Submit
                                    </button>
                                </>
                            )}
                        </div>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleFileUpload} 
                            accept="video/*" 
                            className="hidden" 
                        />
                        {(recordingState === 'ready' || recordingState === 'recording') && (
                            <div className="mt-2 w-16 h-16">
                                <CircularProgressbar
                                    value={timeElapsed}
                                    maxValue={MAX_RECORDING_TIME}
                                    text={`${timeElapsed}s`}
                                    styles={buildStyles({
                                        textColor: "#333",
                                        pathColor: timeElapsed <= MAX_RECORDING_TIME ? "#22c55e" : "#ef4444",
                                        trailColor: '#E5E7EB'
                                    })}
                                />
                            </div>
                        )}
                    </div>
                </div>
                
                {loading && (
                    <div className="mt-4 text-gray-600 text-center">
                        <p>Upload Progress: {uploadProgress.toFixed(2)}%</p>
                        <p>รอประมวลผลประมาณ 1-2 นาที...</p>
                    </div>
                )}
                {error && (
                    <div className="mt-4 p-2 bg-gray-100 text-gray-700">
                        <p>{error}</p>
                    </div>
                )}
                {score && (
                    <div className="mt-6 flex flex-col items-center">
                        <CircularProgressbar
                            value={score}
                            maxValue={100}
                            text={`${score}`}
                            styles={buildStyles({
                                textColor: "#333",
                                pathColor: "#333",
                                trailColor: '#E5E7EB'
                            })}
                        />
                        <div className="mt-4 text-center">
                            <h3 className="text-lg font-bold text-gray-800">
                                Status: {passFailStatus}
                            </h3>
                        </div>
                    </div>
                )}
                {pros && (
                    <div className="mt-6 text-gray-700">
                        <h3 className="text-lg font-bold text-gray-800">นักศึกษาทำได้ดี:</h3>
                        <p>{pros}</p>
                    </div>
                )}
                {recommendations && (
                    <div className="mt-6 text-gray-700">
                        <h3 className="text-lg font-bold text-gray-800">ข้อเสนอแนะ:</h3>
                        <p>{recommendations}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Lab3Recording;