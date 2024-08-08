import { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { FaVideo, FaStop } from 'react-icons/fa';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { useAuth } from '../context/AuthContext';

const MAX_RECORDING_TIME = 180; // 3 minutes in seconds

const Lab1Recording = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [recordedBlob, setRecordedBlob] = useState(null);
    const [timeLeft, setTimeLeft] = useState(MAX_RECORDING_TIME);
    const [loading, setLoading] = useState(false);
    const [passFailStatus, setPassFailStatus] = useState('');
    const [score, setScore] = useState('');
    const [pros, setPros] = useState('');
    const [recommendations, setRecommendations] = useState('');
    const [error, setError] = useState('');
    const { token } = useAuth();

    const mediaRecorderRef = useRef(null);
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const timerRef = useRef(null);

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            streamRef.current = stream;
            videoRef.current.srcObject = stream;
            
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            
            const chunks = [];
            mediaRecorder.ondataavailable = (event) => chunks.push(event.data);
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                setRecordedBlob(blob);
            };
            
            mediaRecorder.start();
            setIsRecording(true);
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
        } catch (err) {
            setError('Error accessing camera: ' + err.message);
        }
    }, []);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            clearInterval(timerRef.current);
            setIsRecording(false);
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
        }
    }, [isRecording]);

    const onSubmit = useCallback(async () => {
        if (!recordedBlob) return;

        setLoading(true);
        setError('');

        try {
            const formData = new FormData();
            formData.append('video', recordedBlob, 'recorded_video.webm');

            const response = await axios.post('/api/v1/lab-deployed/upload-1', formData, {
                headers: { 
                    'Content-Type': 'multipart/form-data',
                    'Authorization': `Bearer ${token}`
                }
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
                        <video ref={videoRef} className="w-full mb-4" autoPlay muted />
                        {!isRecording && !recordedBlob && (
                            <button
                                onClick={startRecording}
                                className="bg-red-500 text-white px-4 py-2 rounded-full flex items-center"
                            >
                                <FaVideo className="mr-2" />
                                Start Recording
                            </button>
                        )}
                        {isRecording && (
                            <button
                                onClick={stopRecording}
                                className="bg-gray-500 text-white px-4 py-2 rounded-full flex items-center"
                            >
                                <FaStop className="mr-2" />
                                Stop Recording
                            </button>
                        )}
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
                    </div>
                </div>
                
                <button
                    onClick={onSubmit}
                    disabled={!recordedBlob}
                    className={`bg-gradient-to-r from-purple-600 to-purple-800 text-white w-full py-3 rounded-full hover:from-purple-700 hover:to-purple-900 transition duration-300 flex items-center justify-center space-x-2 ${!recordedBlob ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <span>ส่งข้อมูล</span>
                </button>
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