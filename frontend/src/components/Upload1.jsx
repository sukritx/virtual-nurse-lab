import { useState } from 'react';
import axios from 'axios';
import { FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import { FiUpload } from 'react-icons/fi';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { useAuth } from '../context/AuthContext';

const Upload1 = () => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [passFailStatus, setPassFailStatus] = useState('');
    const [score, setScore] = useState('');
    const [pros, setPros] = useState('');
    const [recommendations, setRecommendations] = useState('');
    const [error, setError] = useState('');
    const [transcription, setTranscription] = useState('');
    const [videoUrl, setVideoUrl] = useState('');
    const { token } = useAuth();

    const onFileChange = event => {
        setSelectedFile(event.target.files[0]);
        setError('');
    };

    const updateUIWithResult = (result) => {
        setPassFailStatus(result.passFailStatus);
        setScore(result.score);
        setPros(result.pros);
        setRecommendations(result.recommendations);
        setTranscription(result.transcription);
        setVideoUrl(result.videoUrl);
    };

    const onFileUpload = async () => {
        if (!selectedFile) {
            setError('Please select a file first');
            return;
        }

        try {
            setLoading(true);
            setError('');

            const formData = new FormData();
            formData.append('video', selectedFile);

            const response = await axios.post('/api/v1/lab/1', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'Authorization': `Bearer ${token}`
                }
            });

            updateUIWithResult(response.data);
        } catch (error) {
            console.error('Upload error:', error);
            setError('Error uploading file: ' + (error.response?.data?.msg || error.message));
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div className="bg-gray-100 min-h-screen flex flex-col items-center justify-center py-12">
                <div className="w-full max-w-lg bg-white p-8 rounded-lg shadow-lg relative">
                    <h1 className="text-3xl font-extrabold mb-2 text-center text-purple-800">Lab 1: การเลี้ยงลูกด้วยนมแม่</h1>
                    <h2 className="text-xl font-semibold mb-6 text-center text-purple-600">มารดาเจ็บหัวนมด้านขวา</h2>

                    <div className="mb-6">
                        <video 
                            controls 
                            className="w-full rounded-lg shadow-md"
                            src="/questionVideos/situation1.mp4"
                        >
                            Your browser does not support the video tag.
                        </video>
                    </div>
                    
                    <div className="space-y-4 mb-8 text-gray-700">
                        <p>1. ท่านจะให้คำแนะนำใดแก่มารดารายนี้ เช่น การดูดอย่างถูกวิธี 4 ดูด การแก้ไขปัญหา</p>
                        <p>2. ท่านจะสาธิตท่าอุ้มที่ถูกต้อง และการบรรเทา/ป้องกันการเจ็บหัวนม ให้กับมารดารายนี้อย่างไร</p>
                    </div>
                    <div className="mb-6">
                        <input type="file" onChange={onFileChange} className="w-full p-2 border border-gray-300 rounded" />
                        {selectedFile && (
                            <div className="mt-2 flex items-center space-x-2">
                                <FiUpload className="text-blue-500" />
                                <span>{selectedFile.name}</span>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={onFileUpload}
                        className="bg-purple-600 text-white w-full py-3 rounded hover:bg-purple-700 transition duration-200 flex items-center justify-center space-x-2"
                        disabled={loading}
                    >
                        <FiUpload />
                        <span>ส่งข้อมูล</span>
                    </button>
                    {loading && (
                        <div className="w-full rounded-full h-2.5 mt-4">
                            <div className="loading-indicator mt-4 text-purple-600">รอประมวลผลประมาณ 1-2 นาที...</div>
                        </div>
                    )}
                    {error && (
                        <div className="mt-4 p-2 bg-red-200 text-red-700 rounded">
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
                                    pathColor: score >= 60 ? 'green' : 'red',
                                    trailColor: '#d6d6d6'
                                })}
                            />
                            <div className="flex items-center mt-4">
                                {score >= 60 ? <FaCheckCircle className="text-green-700 mr-2" /> : <FaTimesCircle className="text-red-700 mr-2" />}
                                <h3 className={`text-lg font-bold ${score >= 60 ? 'text-green-700' : 'text-red-700'}`}>
                                    Status: {passFailStatus}
                                </h3>
                            </div>
                        </div>
                    )}
                    {pros && (
                        <div className="mt-6 p-4 bg-gray-100 text-gray-700 rounded">
                            <h3 className="text-lg font-bold">นักศึกษาทำได้ดี:</h3>
                            <p>{pros}</p>
                        </div>
                    )}
                    {recommendations && (
                        <div className="mt-6 p-4 bg-gray-100 text-gray-700 rounded">
                            <h3 className="text-lg font-bold">ข้อเสนอแนะ:</h3>
                            <p>{recommendations}</p>
                        </div>
                    )}
                    {transcription && (
                        <div className="mt-6 p-4 bg-gray-100 text-gray-700 rounded">
                            <h3 className="text-lg font-bold">Transcription:</h3>
                            <p>{transcription}</p>
                        </div>
                    )}
                    {videoUrl && (
                        <div className="mt-6">
                            <h3 className="text-lg font-bold mb-2">Uploaded Video:</h3>
                            <video controls className="w-full rounded-lg shadow-md">
                                <source src={videoUrl} type="video/mp4" />
                                Your browser does not support the video tag.
                            </video>
                        </div>
                    )}
                </div>
                <style>{`
                    .loading-indicator {
                        text-align: center;
                        margin-top: 1rem;
                        animation: fadeInOut 2s linear infinite;
                    }
                    @keyframes fadeInOut {
                        0% { opacity: 0; }
                        50% { opacity: 1; }
                        100% { opacity: 0; }
                    }
                `}</style>
            </div>
        </>
    );
};

export default Upload1;