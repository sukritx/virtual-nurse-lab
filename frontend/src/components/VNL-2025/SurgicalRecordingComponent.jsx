// SurgicalRecordingComponent.jsx

import React, { useState, useRef, useCallback, useEffect } from 'react';
import axios from '../../api/axios';
import { FaVideo, FaStop, FaRedo, FaCheck, FaUpload, FaLanguage } from 'react-icons/fa'; // Added FaLanguage
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';

const MAX_RECORDING_TIME = 180; // 3 minutes in seconds
const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

// Removed isLoggedIn from props
const LabRecordingComponent = ({
    labNumber,
    title,
    subtitle,
    description,
    questions,
    videoSrc,
    attemptsLeft,
    setAttemptsLeft,
    language,
    setLanguage, // Retaining setLanguage for completeness, though onLanguageChange is used
    onLanguageChange, // This prop will be used for the language selector
    disableReadyButton
}) => {
    const [recordingState, setRecordingState] = useState('initial');
    const [recordedBlob, setRecordedBlob] = useState(null);
    const [timeElapsed, setTimeElapsed] = useState(0);
    const [loading, setLoading] = useState(false); // State to track loading status
    const [passFailStatus, setPassFailStatus] = useState('');
    const [score, setScore] = useState('');
    const [pros, setPros] = useState('');
    const [recommendations, setRecommendations] = useState('');
    const [error, setError] = useState('');
    const [isMediaRecorderSupported, setIsMediaRecorderSupported] = useState(true);
    const { token } = useAuth(); // We still need token for API calls
    const [uploadProgress, setUploadProgress] = useState(0); // Added for upload progress
    const navigate = useNavigate(); // Still need navigate for potential language changes

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

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && recordingState === 'recording') {
            mediaRecorderRef.current.stop();
            clearInterval(timerRef.current);
            setRecordingState('recorded');
        }
    }, [recordingState]);

    const startCamera = useCallback(async () => {
        if (disableReadyButton || loading) {
            return;
        }
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
    }, [disableReadyButton, loading]);

    const startRecording = useCallback(() => {
        if (disableReadyButton || loading) {
            return;
        }
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
    }, [disableReadyButton, stopRecording, loading]);

    const retakeRecording = useCallback(() => {
        if (disableReadyButton || loading) {
            return;
        }
        setRecordedBlob(null);
        setTimeElapsed(0);
        setRecordingState('ready');
    }, [disableReadyButton, loading]);

    const handleFileUpload = (event) => {
        if (disableReadyButton || loading) {
            event.preventDefault();
            return;
        }
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
        if (!recordedBlob || attemptsLeft === 0 || disableReadyButton || loading) return;

        setLoading(true); // Set loading to true when submission starts
        setError('');
        setUploadProgress(0);

        try {
            const totalChunks = Math.ceil(recordedBlob.size / CHUNK_SIZE);
            const fileName = `surgical-${labNumber}_recording_${Date.now()}.${recordedBlob.type.split('/')[1]}`;

            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                const start = chunkIndex * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, recordedBlob.size);
                const chunk = recordedBlob.slice(start, end);

                const formData = new FormData();
                formData.append('chunk', chunk);
                formData.append('fileName', fileName);
                formData.append('chunkIndex', chunkIndex);
                formData.append('totalChunks', totalChunks);

                await axios.post('/api/v1/vnl2025/upload-chunk', formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                        'Authorization': `Bearer ${token}`
                    }
                });

                setUploadProgress(((chunkIndex + 1) / totalChunks) * 100);
            }

            const response = await axios.post(`/api/v1/vnl2025/surgical/${labNumber}`, {
                fileName,
                totalChunks
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            setPassFailStatus(response.data.passFailStatus);
            setScore(response.data.score);
            setPros(response.data.pros);
            setRecommendations(response.data.recommendations);
            setAttemptsLeft(prevAttempts => Math.max(0, prevAttempts - 1));
        } catch (error) {
            if (error.response) {
                setError(`Error uploading video: ${error.response.data.msg || error.response.statusText}`);
            } else if (error.request) {
                setError('Network error. Please check your connection and try again.');
            } else {
                setError('Error uploading video: ' + error.message);
            }
        } finally {
            setLoading(false); // Set loading back to false when submission finishes (success or error)
        }
    }, [recordedBlob, token, attemptsLeft, labNumber, setAttemptsLeft, disableReadyButton, loading]);

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

    const handleActionClick = (action) => {
        if (loading) {
            return;
        }
        if (action === 'startCamera') startCamera();
        else if (action === 'startRecording') startRecording();
        else if (action === 'uploadFile') fileInputRef.current.click();
    };

    return (
        <div className="bg-white min-h-screen flex flex-col items-center justify-center py-12">
            <div className="w-full max-w-2xl p-8">

                <div className="mb-6 text-center">
                    <a
                        href="/surgical/dashboard"
                        className="inline-flex items-center justify-center space-x-2 bg-gray-200 text-gray-700 px-4 py-2 rounded-full hover:bg-gray-300 transition duration-300"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                        <span>Back to Dashboard</span>
                    </a>
                </div>

                <div className="mb-6">
                    <div className={`
                        px-4 py-2 rounded-full inline-flex items-center
                        ${attemptsLeft > 1 ? 'bg-green-100 text-green-800' :
                        attemptsLeft === 1 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'}
                        transition-colors duration-300
                    `}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                            </svg>
                            <span className="font-semibold">
                                {attemptsLeft === 0 ? 'No attempts left' :
                                attemptsLeft === 1 ? 'Last attempt' :
                                `${attemptsLeft} attempts left`}
                            </span>
                        </div>
                </div>

                <h1 className="text-2xl font-bold mb-2 text-center text-gray-800">{title}</h1>
                <h2 className="text-lg mb-6 text-center text-gray-600">{subtitle}</h2>

                <div className="mb-6 p-4 bg-gray-100 rounded-lg text-sm text-gray-700">
                    <p>{description}</p>
                </div>

                <div className="mb-6 rounded-3xl overflow-hidden border-4 border-purple-900 shadow-lg">
                    <video
                        controls
                        className="w-full"
                        src={videoSrc}
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
                    {questions.map((question, index) => (
                        <p key={index}>{`${index + 1}. ${question}`}</p>
                    ))}
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
                                style={{ transform: 'scaleX(-1)' }}
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
                                            onClick={() => handleActionClick('startCamera')}
                                            className={`bg-blue-500 text-white px-4 py-2 rounded-full flex items-center ${disableReadyButton || (attemptsLeft === 0) || loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            disabled={disableReadyButton || (attemptsLeft === 0) || loading}
                                        >
                                            <FaVideo className="mr-2" />
                                            Ready
                                        </button>
                                    )}
                                    {recordingState === 'ready' && (
                                        <button
                                            onClick={() => handleActionClick('startRecording')}
                                            className={`bg-red-500 text-white px-4 py-2 rounded-full flex items-center ${disableReadyButton || (attemptsLeft === 0) || loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            disabled={disableReadyButton || (attemptsLeft === 0) || loading}
                                        >
                                            <FaVideo className="mr-2" />
                                            Start Recording
                                        </button>
                                    )}
                                    {recordingState === 'recording' && (
                                        <button
                                            onClick={stopRecording}
                                            className="bg-gray-500 text-white px-4 py-2 rounded-full flex items-center"
                                            disabled={disableReadyButton || loading}
                                        >
                                            <FaStop className="mr-2" />
                                            Stop Recording
                                        </button>
                                    )}
                                </>
                            ) : (
                                <button
                                    onClick={() => handleActionClick('uploadFile')}
                                    className={`bg-blue-500 text-white px-4 py-2 rounded-full flex items-center ${disableReadyButton || (attemptsLeft === 0) || loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    disabled={disableReadyButton || (attemptsLeft === 0) || loading}
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
                                        disabled={disableReadyButton || loading}
                                    >
                                        <FaRedo className="mr-2" />
                                        Retake
                                    </button>
                                    <button
                                        onClick={onSubmit}
                                        className={`bg-green-500 text-white px-4 py-2 rounded-full flex items-center ${disableReadyButton || (attemptsLeft === 0) || loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        disabled={disableReadyButton || (attemptsLeft === 0) || loading}
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
                            disabled={disableReadyButton || loading}
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

                {attemptsLeft === 0 && (
                    <p className="text-red-500 mt-4 text-center">You have used all your attempts for this lab.</p>
                )}

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

LabRecordingComponent.propTypes = {
    labNumber: PropTypes.number.isRequired,
    title: PropTypes.string.isRequired,
    subtitle: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
    questions: PropTypes.arrayOf(PropTypes.string).isRequired,
    videoSrc: PropTypes.string.isRequired,
    attemptsLeft: PropTypes.number.isRequired,
    setAttemptsLeft: PropTypes.func.isRequired,
    language: PropTypes.string.isRequired,
    setLanguage: PropTypes.func.isRequired,
    onLanguageChange: PropTypes.func.isRequired,
    disableReadyButton: PropTypes.bool,
};

LabRecordingComponent.defaultProps = {
    disableReadyButton: false,
};

export default LabRecordingComponent;