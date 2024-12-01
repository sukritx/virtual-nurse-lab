import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import LabRecordingComponent from '../LabRecordingComponent';

const MAX_ATTEMPTS = 3;
const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

const Lab1RecordingIndo = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('id');
    const { token } = useAuth();
    const navigate = useNavigate();

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

    const handleLanguageChange = (event) => {
        const newLanguage = event.target.value;
        setLanguage(newLanguage);
        
        if (newLanguage === 'zh') {
            navigate('/student/upload1cn');
        } else if (newLanguage === 'en') {
            navigate('/student/upload1en');
        } else if (newLanguage === 'jp') {
            navigate('/student/upload1jp');
        } else if (newLanguage === 'th') {
            navigate('/student/upload1');
        }
    };

    const onSubmit = useCallback(async (recordedBlob) => {
        if (!recordedBlob || attemptsLeft === 0) return;

        try {
            const totalChunks = Math.ceil(recordedBlob.size / CHUNK_SIZE);
            const fileName = `lab1_recording_indo_${Date.now()}.${recordedBlob.type.split('/')[1]}`;

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
            }

            const response = await axios.post('/api/v1/lab-deployed/upload-1-indo', {
                fileName,
                totalChunks
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            // Handle the response here (e.g., update state with score, recommendations, etc.)
            console.log(response.data);

            // Update attempts left
            setAttemptsLeft(prevAttempts => Math.max(0, prevAttempts - 1));

        } catch (error) {
            console.error('Error uploading video:', error);
            // Handle error (e.g., show error message to user)
        }
    }, [token, attemptsLeft]);

    return (
        <LabRecordingComponent
            labNumber={1}
            title="Lab 1: Menyusui"
            subtitle="Ibu dengan Puting Sakit di Sisi Kanan"
            description="Seorang ibu berusia 17 tahun, 1 hari setelah melahirkan anak pertamanya (laki-laki). 
                        Bayi dalam kondisi sehat dengan berat 2.800 gram. Ibu belum bisa menggendong bayinya 
                        untuk menyusui sendiri. ASI mulai keluar, tetapi ibu merasakan sakit pada puting saat 
                        bayi menyusu, terutama di sisi kanan. Skor LATCH = 5 (latch on=1, audible=1, 
                        type of nipple=2, comfort=1, holding=0)"
            questions={[
                "Apa saran yang akan Anda berikan kepada ibu ini, misalnya tentang teknik menyusui yang benar (4 langkah menyusui) dan cara mengatasi masalahnya?",
                "Bagaimana Anda akan mendemonstrasikan posisi menggendong yang benar dan cara mengurangi/mencegah sakit pada puting untuk ibu ini?"
            ]}
            videoSrc="/questionVideos/situation1.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft} 
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
            onSubmit={onSubmit}
        />
    );
};

export default Lab1RecordingIndo;
