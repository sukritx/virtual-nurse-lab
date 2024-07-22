import { useState } from 'react';
import axios from 'axios';
import { FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import { FiUpload } from 'react-icons/fi';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { useAuth } from '../context/AuthContext';

const Upload9 = () => {
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
        const formData = new FormData();
        formData.append('video', selectedFile);

        try {
            setLoading(true);
            setError(''); // Clear previous errors
            const response = await axios.post('http://localhost:3000/api/v1/lab/9', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'Authorization': `Bearer ${token}` // Include the token in the headers
                }
            });
            setPassFailStatus(response.data.passFailStatus);
            setScore(response.data.score);
            setPros(response.data.pros);
            setRecommendations(response.data.recommendations);
            setLoading(false);
        } catch (error) {
            setLoading(false);
            setError('Error uploading file: ' + error.message);
        }
    };

    return (
        <>
            <div className="bg-gray-100 min-h-screen flex flex-col items-center justify-center py-12">
                <div className="w-full max-w-lg bg-white p-8 rounded-lg shadow-lg relative">
                <h2 className="text-3xl font-bold mb-6 text-center text-gray-800">Lab 8: การส่งเสริมพัฒนาการทารก</h2>
                    <p className="mb-6 text-center text-gray-600">ณ หอผู้ป่วยหลังคลอด</p>
                    <p className="mb-6 text-center text-gray-600">ในวันที่ 3 ของมารดาหลังคลอดปกติและครบกำหนดรายหนึ่ง ในการสอนมารดารายเดี่ยวเพื่อเตรียมตัวจะกลับบ้าน มารดาสอบถามว่า “จะสามารถกระตุ้นพัฒนาการของลูกในช่วงแรกเกิดถึง 2 เดือนได้อย่างไร” ท่านจะให้คำแนะนำมารดารายนี้อย่างไร</p>
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
                            <div className="loading-indicator mt-4 text-purple-600">รอประมวลผลประมาณ 30 วินาที...</div>
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

export default Upload9;
