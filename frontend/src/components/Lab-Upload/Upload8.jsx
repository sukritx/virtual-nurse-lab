import { useState, useCallback } from 'react';
import axios from 'axios';
import { FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import { FiUpload } from 'react-icons/fi';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import { useAuth } from '../../context/AuthContext';

const CHUNK_SIZE = 1024 * 1024 * 5; // 5MB chunks
const MAX_FILE_SIZE = 1024 * 1024 * 500; // 500MB max file size

const Upload8 = () => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [passFailStatus, setPassFailStatus] = useState('');
    const [score, setScore] = useState('');
    const [pros, setPros] = useState('');
    const [recommendations, setRecommendations] = useState('');
    const [error, setError] = useState('');
    const [uploadProgress, setUploadProgress] = useState(0);
    const { token } = useAuth();

    const onFileChange = event => {
        const file = event.target.files[0];
        if (file && file.size > MAX_FILE_SIZE) {
            setError(`File size exceeds the maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB.`);
            setSelectedFile(null);
        } else {
            setSelectedFile(file);
            setError('');
        }
    };

    const uploadChunk = async (chunk, chunkIndex, totalChunks) => {
        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('chunkIndex', chunkIndex);
        formData.append('totalChunks', totalChunks);
    
        await axios.post('/api/v1/lab-deployed/upload-chunk', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
                'Authorization': `Bearer ${token}`
            }
        });
        setUploadProgress(((chunkIndex + 1) / totalChunks) * 100);
    };

    const onFileUpload = useCallback(async () => {
        if (!selectedFile) return;

        const totalChunks = Math.ceil(selectedFile.size / CHUNK_SIZE);
        setLoading(true);
        setError('');

        try {
            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                const chunk = selectedFile.slice(
                    chunkIndex * CHUNK_SIZE,
                    (chunkIndex + 1) * CHUNK_SIZE
                );
                await uploadChunk(new Blob([chunk]), chunkIndex, totalChunks);
            }

            // After all chunks are uploaded, process the file
            const response = await axios.post('/api/v1/lab-deployed/upload-8', {
                fileName: selectedFile.name,
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
                setError(`Error uploading file: ${error.response.data.msg || error.response.statusText}`);
            } else if (error.request) {
                setError('Network error. Please check your connection and try again.');
            } else {
                setError('Error uploading file: ' + error.message);
            }
        } finally {
            setLoading(false);
            setUploadProgress(0);
        }
    }, [selectedFile, token]);

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

                <h1 className="text-2xl font-bold mb-2 text-center text-gray-800">Lab 8: การทำความสะอาดตาและสายสะดือทารก</h1>

                <div className="mb-6 rounded-3xl overflow-hidden border-4 border-purple-900 shadow-lg">
                    <video 
                        controls 
                        className="w-full"
                        src="/questionVideos/situation8.mp4"
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
                    <p>ท่านจะให้คำแนะนำในการทำความสะอาดตาและสายสะดือทารกแก่มารดารายนี้อย่างไร (ครอบคลุมประเด็น การเตรียมอุปกรณ์ และขั้นตอนการทำความสะอาดตาและสายสะดือ)</p>
                </div>
                
                <div className="mb-6">
                    <label className="block mb-2 text-sm font-medium text-gray-700">
                        Upload your file
                    </label>
                    <div 
                        onClick={() => document.getElementById('file-upload').click()}
                        className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md cursor-pointer hover:border-purple-500 transition duration-300"
                    >
                        <div className="space-y-1 text-center">
                            <svg
                                className="mx-auto h-12 w-12 text-gray-400"
                                stroke="currentColor"
                                fill="none"
                                viewBox="0 0 48 48"
                                aria-hidden="true"
                            >
                                <path
                                    d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                            <div className="flex text-sm text-gray-600">
                                <span className="relative cursor-pointer bg-white rounded-md font-medium text-purple-600 hover:text-purple-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-purple-500">
                                    Upload a file
                                </span>
                                <p className="pl-1">or drag and drop</p>
                            </div>
                            <p className="text-xs text-gray-500">MP3, M4A, WAV up to 150MB</p>
                        </div>
                    </div>
                    <input 
                        id="file-upload" 
                        name="file-upload" 
                        type="file" 
                        className="hidden" 
                        onChange={onFileChange}
                        accept=".mp3,.wav, .m4a, .mp4, .mov"
                    />
                    {selectedFile && (
                        <div className="mt-2 flex items-center space-x-2 text-sm text-gray-600">
                            <FiUpload className="text-purple-600" />
                            <span>{selectedFile.name}</span>
                        </div>
                    )}
                </div>
                
                <button
                    onClick={onFileUpload}
                    className="bg-gradient-to-r from-purple-600 to-purple-800 text-white w-full py-3 rounded-full hover:from-purple-700 hover:to-purple-900 transition duration-300 flex items-center justify-center space-x-2"
                >
                    <FiUpload />
                    <span>ส่งข้อมูล</span>
                </button>
                {loading && (
                    <div className="mt-4 text-gray-600 text-center">รอประมวลผลประมาณ 1-2 นาที...</div>
                )}
                {uploadProgress > 0 && uploadProgress < 100 && (
                    <div className="mt-6 bg-gray-100 rounded-full p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-700">Uploading...</span>
                            <span className="text-sm font-medium text-gray-700">{uploadProgress.toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                            <div 
                                className="bg-purple-600 h-2.5 rounded-full transition-all duration-300 ease-in-out"
                                style={{ width: `${uploadProgress}%` }}
                            ></div>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Please wait while your file is being uploaded</p>
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

export default Upload8;