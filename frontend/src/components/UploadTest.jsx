import { useState } from 'react';
import axios from 'axios';
import { FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import { FiUpload } from 'react-icons/fi';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { useAuth } from '../context/AuthContext';

const UploadTest = () => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [passFailStatus, setPassFailStatus] = useState('');
    const [score, setScore] = useState('');
    const [pros, setPros] = useState('');
    const [recommendations, setRecommendations] = useState('');
    const { token } = useAuth(); // Get the token from the Auth context

    const onFileChange = event => {
        setSelectedFile(event.target.files[0]);
    };

    const onFileUpload = async () => {
        const data = { userId: 'dsads' };

        try {
            setLoading(true);
            const response = await axios.post('http://localhost:3000/api/v1/lab/dummy', data, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` // Include the token in the headers
                }
            });
            setPassFailStatus(response.data.passFailStatus);
            setScore(response.data.score);
            setPros(response.data.pros);
            setRecommendations(response.data.recommendations);
            setLoading(false);
        } catch (error) {
            console.error('Error uploading data:', error);
            setLoading(false);
        }
    };

    return (
        <>
            <div className="bg-gray-100 min-h-screen flex flex-col items-center justify-center py-12">
                <div className="w-full max-w-lg bg-white p-8 rounded-lg shadow-lg relative">
                    <h2 className="text-3xl font-bold mb-6 text-center text-gray-800">Lab 1: Virtual Nurse Lab</h2>
                    <p className="mb-6 text-center text-gray-600">ตอบคำถามเสมือนว่ามารดาอยู่ต่อหน้า...กรณีศึกษา มารดาเจ็บหัวนม</p>
                    <ul className="mb-6 list-disc list-inside text-gray-700">
                        <li className="mb-2">ท่านจะซักประวัติใดเพิ่มเติม</li>
                        <li className="mb-2">ท่านจะกำหนดข้อวินิจฉัยทางการพยาบาลสำหรับมารดารายนี้อย่างไร (เลือกตอบ 1 ข้อ)</li>
                        <li className="mb-2">ท่านจะให้คำแนะนำใดแก่มารดารายนี้</li>
                        <li className="mb-2">ท่านจะสาธิตท่าอุ้มที่ถูกต้อง และการบรรเทา/ป้องกันการเจ็บหัวนม ให้กับมารดารายนี้อย่างไร</li>
                    </ul>
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
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mt-4">
                            <div className="loading-indicator mt-4 text-purple-600">รอประมวลผลประมาณ 1-2นาที...</div>
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
                                    pathColor: score >= 50 ? 'green' : 'red',
                                    trailColor: '#d6d6d6'
                                })}
                            />
                            <div className="flex items-center mt-4">
                                {score >= 50 ? <FaCheckCircle className="text-green-700 mr-2" /> : <FaTimesCircle className="text-red-700 mr-2" />}
                                <h3 className={`text-lg font-bold ${score >= 50 ? 'text-green-700' : 'text-red-700'}`}>
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

export default UploadTest;
