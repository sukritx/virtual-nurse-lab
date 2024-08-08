import React, { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import { FaVideo, FaStop, FaRedo, FaCheck, FaCog } from 'react-icons/fa';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { useAuth } from '../context/AuthContext';

const MAX_RECORDING_TIME = 180; // 3 minutes in seconds

const Lab1Recording = () => {
    const [recordingState, setRecordingState] = useState('initial');
    const [recordedBlob, setRecordedBlob] = useState(null);
    const [timeLeft, setTimeLeft] = useState(MAX_RECORDING_TIME);
    const [loading, setLoading] = useState(false);
    const [passFailStatus, setPassFailStatus] = useState('');
    const [score, setScore] = useState('');
    const [pros, setPros] = useState('');
    const [recommendations, setRecommendations] = useState('');
    const [error, setError] = useState('');
    const [showQualitySettings, setShowQualitySettings] = useState(false);
    const [videoQuality, setVideoQuality] = useState('720p');
    const { token } = useAuth();

    const mediaRecorderRef = useRef(null);
    const liveVideoRef = useRef(null);
    const recordedVideoRef = useRef(null);
    const streamRef = useRef(null);
    const timerRef = useRef(null);

    const getVideoConstraints = useCallback(() => {
        switch(videoQuality) {
            case '480p':
                return { width: 640, height: 480 };
            case '720p':
                return { width: 1280, height: 720 };
            case '1080p':
                return { width: 1920, height: 1080 };
            default:
                return { width: 1280, height: 720 };
        }
    }, [videoQuality]);

    const startCamera = useCallback(async () => {
        try {
            const constraints = {
                video: getVideoConstraints(),
                audio: true
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;
            liveVideoRef.current.srcObject = stream;
            setRecordingState('ready');
        } catch (err) {
            setError('Error accessing camera: ' + err.message);
        }
    }, [getVideoConstraints]);

    const startRecording = useCallback(() => {
        const mediaRecorder = new MediaRecorder(streamRef.current, {mimeType: 'video/webm'});
        mediaRecorderRef.current = mediaRecorder;
        
        const chunks = [];
        mediaRecorder.ondataavailable = (event) => chunks.push(event.data);
        mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            setRecordedBlob(blob);
            recordedVideoRef.current.src = URL.createObjectURL(blob);
        };
        
        mediaRecorder.start();
        setRecordingState('recording');
        setTimeLeft(MAX_RECORDING_TIME);
        
        timerRef.current = setInterval(() => {
            setTimeLeft((prevTime) => {
                if (prevTime <= 1) {
                    clearInterval(timerRef.current);
                    stopRecording();
                    return 0;
                }
                return prevTime - 1;
            });
        }, 1000);

        // Ensure recording stops after 3 minutes
        setTimeout(() => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                stopRecording();
            }
        }, MAX_RECORDING_TIME * 1000);
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
        setTimeLeft(MAX_RECORDING_TIME);
        setRecordingState('ready');
    }, []);

    const onSubmit = useCallback(async () => {
        // ... (rest of the onSubmit function remains the same)
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

                <h1 className="text-2xl font-bold mb-2 text-center text-gray-800">Lab 1: การเลี้ยงลูกด้วยนมแม่</h1>
                <h2 className="text-lg mb-6 text-center text-gray-600">มารดาเจ็บหัวนมด้านขวา</h2>

                <div className="mb-6 p-4 bg-gray-100 rounded-lg text-sm text-gray-700">
                    <p>
                        มารดาอายุ 17 ปี หลังคลอดบุตรคนแรกเพศชายได้ 1 วัน บุตรสุขภาพแข็งแรงดี บุตรหนัก 2,800 กรัม 
                        มารดายังอุ้มบุตรดูดนมเองไม่ได้ น้ำนมเริ่มไหล มีอาการเจ็บหัวนมขณะที่บุตรดูดนม เจ็บข้างขวามากกว่าข้างซ้าย 
                        ประเมิน LATCH score = 5 (latch on=1, audible=1, type of nipple=2, comfort=1, holding= 0)
                    </p>
                </div>

                <div className="mb-6 rounded-3xl overflow-hidden border-4 border-purple-900 shadow-lg">
                    <video 
                        controls 
                        className="w-full"
                        src="/questionVideos/situation1.mp4"
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
                    <p>1. ท่านจะให้คำแนะนำใดแก่มารดารายนี้ เช่น การดูดอย่างถูกวิธี 4 ดูด การแก้ไขปัญหา</p>
                    <p>2. ท่านจะสาธิตท่าอุ้มที่ถูกต้อง และการบรรเทา/ป้องกันการเจ็บหัวนม ให้กับมารดารายนี้อย่างไร</p>
                </div>
                
                <div className="mb-6">
                    <label className="block mb-2 text-sm font-medium text-gray-700">
                        Record your response
                    </label>
                    <div className="mt-1 flex flex-col items-center justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                        {recordingState !== 'recorded' && (
                            <video 
                                ref={liveVideoRef} 
                                className="w-full mb-4" 
                                autoPlay 
                                muted 
                                style={{transform: 'scaleX(-1)'}}
                            />
                        )}
                        {recordingState === 'recorded' && (
                            <video 
                                ref={recordedVideoRef} 
                                className="w-full mb-4" 
                                controls
                            />
                        )}
                        <div className="flex space-x-2 mb-4">
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
                            {recordingState !== 'recording' && (
                                <button
                                    onClick={() => setShowQualitySettings(!showQualitySettings)}
                                    className="bg-gray-300 text-gray-700 px-4 py-2 rounded-full flex items-center"
                                >
                                    <FaCog className="mr-2" />
                                    Quality
                                </button>
                            )}
                        </div>
                        {showQualitySettings && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Video Quality
                                </label>
                                <select
                                    value={videoQuality}
                                    onChange={(e) => setVideoQuality(e.target.value)}
                                    className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                                >
                                    <option value="480p">480p</option>
                                    <option value="720p">720p</option>
                                    <option value="1080p">1080p</option>
                                </select>
                            </div>
                        )}
                        {(recordingState === 'ready' || recordingState === 'recording') && (
                            <div className="mt-2 w-16 h-16">
                                <CircularProgressbar
                                    value={timeLeft}
                                    maxValue={MAX_RECORDING_TIME}
                                    text={`${timeLeft}s`}
                                    styles={buildStyles({
                                        textColor: "#333",
                                        pathColor: timeLeft > 30 ? "#22c55e" : "#ef4444",
                                        trailColor: '#E5E7EB'
                                    })}
                                />
                            </div>
                        )}
                    </div>
                </div>
                
                {loading && (
                    <div className="mt-4 text-gray-600 text-center">รอประมวลผลประมาณ 1-2 นาที...</div>
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

export default Lab1Recording;