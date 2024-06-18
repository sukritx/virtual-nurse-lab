import { useState } from 'react';
import axios from 'axios';

const Upload = () => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [feedback, setFeedback] = useState('');
    const [transcription, setTranscription] = useState('');
    const [loading, setLoading] = useState(false);

    const onFileChange = event => {
        setSelectedFile(event.target.files[0]);
    };

    const onFileUpload = async () => {
        const formData = new FormData();
        formData.append('video', selectedFile);

        try {
            setLoading(true);
            const response = await axios.post('http://localhost:3000/api/v1/lab/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
            setFeedback(response.data.feedback);
            setTranscription(response.data.transcription);
            setLoading(false);
        } catch (error) {
            console.error('Error uploading file:', error);
            setLoading(false);
        }
    };

    return (
        <div className="bg-gray-100 min-h-screen flex flex-col items-center justify-center py-12">
            <div className="w-full max-w-lg bg-white p-8 rounded-lg shadow-lg">
                <h2 className="text-3xl font-bold mb-6 text-center text-gray-800">Lab 1: Virtual Nurse Lab</h2>
                <p className="mb-6 text-center text-gray-600">ตอบคำถามเสมือนว่ามารดาอยู่ต่อหน้า...กรณีศึกษา มารดาเจ็บหัวนม</p>
                <ul className="mb-6 list-disc list-inside text-gray-700">
                    <li className="mb-2">ท่านจะซักประวัติใดเพิ่มเติม</li>
                    <li className="mb-2">ท่านจะกำหนดข้อวินิจฉัยทางการพยาบาลสำหรับมารดารายนี้อย่างไร (เลือกตอบ 1 ข้อ)</li>
                    <li className="mb-2">ท่านจะให้คำแนะนำใดแก่มารดารายนี้</li>
                    <li className="mb-2">ท่านจะสาธิตท่าอุ้มที่ถูกต้อง และการบรรเทา/ป้องกันการเจ็บหัวนม ให้กับมารดารายนี้อย่างไร</li>
                </ul>
                <input type="file" onChange={onFileChange} className="mb-6 w-full p-2 border border-gray-300 rounded" />
                <button onClick={onFileUpload} className="bg-purple-600 text-white w-full py-3 rounded hover:bg-purple-700 transition duration-200">
                    อัพโหลด
                </button>
                {loading && <div className="loading-indicator mt-4 text-purple-600">รอประมวลผลประมาณ 1-2นาที...</div>}
                {feedback && (
                    <div className="mt-6 p-4 bg-green-100 text-green-700 rounded">
                        <h3 className="text-lg font-bold">Feedback:</h3>
                        <p>{feedback}</p>
                    </div>
                )}
                {transcription && (
                    <div className="mt-6 p-4 bg-blue-100 text-blue-700 rounded">
                        <h3 className="text-lg font-bold">Transcription:</h3>
                        <p>{transcription}</p>
                    </div>
                )}
            </div>
            <style jsx>{`
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
    );
};

export default Upload;
