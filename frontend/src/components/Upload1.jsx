import { useState } from 'react';
import axios from 'axios';
import { FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import { FiUpload } from 'react-icons/fi';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { useAuth } from '../context/AuthContext';

import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const Upload1 = () => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [passFailStatus, setPassFailStatus] = useState('');
    const [score, setScore] = useState('');
    const [pros, setPros] = useState('');
    const [recommendations, setRecommendations] = useState('');
    const [error, setError] = useState(''); // State for error message
    const { token } = useAuth(); // Get the token from the Auth context

    const onFileChange = event => {
        setSelectedFile(event.target.files[0]);
        setError(''); // Clear previous errors
    };

    const onFileUpload = async () => {
        if (!selectedFile) return;

        const s3Client = new S3Client({
            endpoint: `https://${import.meta.env.VITE_DO_SPACES_ENDPOINT}`,
            region: import.meta.env.VITE_DO_SPACES_REGION,
            credentials: {
                accessKeyId: import.meta.env.VITE_DO_SPACES_KEY,
                secretAccessKey: import.meta.env.VITE_DO_SPACES_SECRET
            }
        });
        
        const params = {
            Bucket: import.meta.env.VITE_DO_SPACES_BUCKET,
            Key: `lab1/${Date.now()}_${selectedFile.name}`,
            Body: selectedFile,
            ACL: "public-read"
        };

        try {
            setLoading(true);
            setError('');

            // Upload file to DigitalOcean Spaces
            const upload = new Upload({
                client: s3Client,
                params: params
            });

            const result = await upload.done();
            const fileUrl = result.Location;

            // Send file URL to your server for processing
            const response = await axios.post('https://localhost:3000/api/v1/lab/process-1',
                { fileUrl },
                { headers: { 'Authorization': `Bearer ${token}` } }
            );

            // Handle response as before
            setPassFailStatus(response.data.passFailStatus);
            setScore(response.data.score);
            setPros(response.data.pros);
            setRecommendations(response.data.recommendations);
        } catch (error) {
            setError('Error uploading file: ' + error.message);
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

                    {/* Add video element here */}
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
