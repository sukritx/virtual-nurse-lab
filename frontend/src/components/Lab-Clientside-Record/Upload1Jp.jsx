import React, { useState, useRef, useCallback, useEffect } from 'react';
import axios from '../../api/axios';
import { FaVideo, FaStop, FaRedo, FaCheck, FaUpload, FaLanguage } from 'react-icons/fa';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const MAX_RECORDING_TIME = 180; // 3 minutes in seconds
const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
const MAX_ATTEMPTS = 3;

const Lab1Recording = () => {
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
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('jp'); // Default to Japanese
    const navigate = useNavigate();

    const mediaRecorderRef = useRef(null);
    const liveVideoRef = useRef(null);
    const recordedVideoRef = useRef(null);
    const streamRef = useRef(null);
    const timerRef = useRef(null);
    const fileInputRef = useRef(null);

    const handleLanguageChange = (event) => {
        const newLanguage = event.target.value;
        setLanguage(newLanguage);
        
        // Redirect based on the selected language
        if (newLanguage === 'zh') {
            navigate('/student/upload1cn');
        } else if (newLanguage === 'en') {
            navigate('/student/upload1en');
        } else if (newLanguage === 'th') {
            navigate('/student/upload1');
        }
        // For Japanese, we stay on the current page
    };

    useEffect(() => {
        setIsMediaRecorderSupported(typeof MediaRecorder !== 'undefined');
    }, []);

    useEffect(() => {
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab1 = response.data.labs.find(lab => lab.labInfo.labNumber === 1);
                if (lab1) {
                    setAttemptsLeft(lab1.attemptsLeft);
                }
            } catch (error) {
                console.error('Error fetching lab info:', error);
            }
        };

        fetchLabInfo();
    }, [token]);

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
        if (!recordedBlob || attemptsLeft === 0) return;

        setLoading(true);
        setError('');
        setUploadProgress(0);

        try {
            const totalChunks = Math.ceil(recordedBlob.size / CHUNK_SIZE);
            const fileName = `lab1_recording_${Date.now()}.${recordedBlob.type.split('/')[1]}`;

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

            const response = await axios.post('/api/v1/lab-deployed/upload-1-jp', {
                fileName,
                totalChunks
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            setPassFailStatus(response.data.passFailStatus);
            setScore(response.data.score);
            setPros(response.data.pros);
            setRecommendations(response.data.recommendations);
            // After successful submission
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
            setLoading(false);
        }
    }, [recordedBlob, token, attemptsLeft]);

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
                        <span>ダッシュボードに戻る</span>
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
                            {attemptsLeft === 0 ? '残りの試行回数はありません' : 
                            attemptsLeft === 1 ? '最後の試行' : 
                            `${attemptsLeft} 回の試行回数が残っています`}
                        </span>
                    </div>
                </div>

                <div className="mb-6 flex justify-end">
                    <div className="flex items-center">
                        <FaLanguage className="mr-2 text-gray-600" />
                        <select
                            value={language}
                            onChange={handleLanguageChange}
                            className="bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="th">ภาษาไทย</option>
                            <option value="zh">中文</option>
                            <option value="en">English</option>
                            <option value="jp">日本語</option>
                        </select>
                    </div>
                </div>
    
                <h1 className="text-2xl font-bold mb-2 text-center text-gray-800">ラボ1：母乳育児</h1>
                <h2 className="text-lg mb-6 text-center text-gray-600">母親の右乳頭の痛み</h2>
    
                <div className="mb-6 p-4 bg-gray-100 rounded-lg text-sm text-gray-700">
                    <p>
                        17歳の初産婦が出産1日後、2800グラムの健康な男児を出産しました。母親は授乳時に赤ちゃんの位置を自分で調整するのが難しいと報告しています。母乳分泌は始まっていますが、授乳中に乳頭痛を感じ、左側よりも右側の方が強い不快感があります。LATCHスコアは5（吸着=1、聞こえる音=1、乳頭の種類=2、快適さ=1、抱き方=0）です。
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
                        <span>使用方法</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </a>
                </div>
                
                <div className="space-y-4 mb-8 text-gray-700">
                    <p>1. この母親にどのようなアドバイスをしますか？例えば、正しい授乳方法、4回の授乳、問題の解決方法など。</p>
                    <p>2. この母親に対して、正しい抱き方と乳頭痛の緩和/予防方法をどのように実演しますか？</p>
                </div>
                
                <div className="mb-6">
                    <label className="block mb-2 text-sm font-medium text-gray-700">
                        {isMediaRecorderSupported ? "回答を録音する (480p)" : "回答をアップロードする"}
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
                                            className={`bg-blue-500 text-white px-4 py-2 rounded-full flex items-center ${attemptsLeft === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            disabled={attemptsLeft === 0}
                                        >
                                            <FaVideo className="mr-2" />
                                            準備完了
                                        </button>
                                    )}
                                    {recordingState === 'ready' && (
                                        <button
                                            onClick={startRecording}
                                            className={`bg-red-500 text-white px-4 py-2 rounded-full flex items-center ${attemptsLeft === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            disabled={attemptsLeft === 0}
                                        >
                                            <FaVideo className="mr-2" />
                                            録画開始
                                        </button>
                                    )}
                                    {recordingState === 'recording' && (
                                        <button
                                            onClick={stopRecording}
                                            className="bg-gray-500 text-white px-4 py-2 rounded-full flex items-center"
                                        >
                                            <FaStop className="mr-2" />
                                            録画停止
                                        </button>
                                    )}
                                </>
                            ) : (
                                <button
                                    onClick={() => fileInputRef.current.click()}
                                    className={`bg-blue-500 text-white px-4 py-2 rounded-full flex items-center ${attemptsLeft === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    disabled={attemptsLeft === 0}
                                >
                                    <FaUpload className="mr-2" />
                                    ビデオをアップロード
                                </button>
                            )}
                            {recordingState === 'recorded' && (
                                <>
                                    <button
                                        onClick={retakeRecording}
                                        className="bg-yellow-500 text-white px-4 py-2 rounded-full flex items-center"
                                    >
                                        <FaRedo className="mr-2" />
                                        再撮影
                                    </button>
                                    <button
                                        onClick={onSubmit}
                                        className={`bg-green-500 text-white px-4 py-2 rounded-full flex items-center ${attemptsLeft === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        disabled={attemptsLeft === 0}
                                    >
                                        <FaCheck className="mr-2" />
                                        送信
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
                
                {attemptsLeft === 0 && (
                    <p className="text-red-500 mt-4 text-center">このラボの試行回数をすべて使い果たしました。</p>
                )}
                
                {loading && (
                    <div className="mt-4 text-gray-600 text-center">
                        <p>アップロード進捗: {uploadProgress.toFixed(2)}%</p>
                        <p>処理に1～2分かかります...</p>
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
                                ステータス: {passFailStatus}
                            </h3>
                        </div>
                    </div>
                )}
                {pros && (
                    <div className="mt-6 text-gray-700">
                        <h3 className="text-lg font-bold text-gray-800">学生の良い点:</h3>
                        <p>{pros}</p>
                    </div>
                )}
                {recommendations && (
                    <div className="mt-6 text-gray-700">
                        <h3 className="text-lg font-bold text-gray-800">提案:</h3>
                        <p>{recommendations}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Lab1Recording;