import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import LabRecordingComponent from '../LabRecordingComponent';

const MAX_ATTEMPTS = 3;
const MAX_FILE_SIZE = 1024 * 1024 * 500; // 500MB max file size

const Lab10Recording = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('th');
    const { token } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab10 = response.data.labs.find(lab => lab.labInfo.labNumber === 10);
                if (lab10) {
                    setAttemptsLeft(lab10.attemptsLeft);
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
            navigate('/student/upload10cn');
        } else if (newLanguage === 'en') {
            navigate('/student/upload10en');
        } else if (newLanguage === 'jp') {
            navigate('/student/upload10jp');
        }
        // For Thai, we stay on the current page
    };

    return (
        <LabRecordingComponent
            labNumber={10}
            title="Lab 10: การสื่อสัญญาณทารก"
            subtitle=""
            description={`มารดาครรภ์แรกที่คลอดทารกครบกำหนด 2 วัน บ่นกับท่านว่า "จะทราบได้อย่างไรว่าลูกหิว หรือ อยากกินนมแล้ว"`}
            questions={[
                "ท่านจะให้คำแนะนำเพื่อสังเกตพฤติกรรมที่ทารกจะแสดงออกเมื่อหิว ให้มารดารายนี้ได้อย่างไร"
            ]}
            videoSrc="/questionVideos/situation10.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
            instructionsLink="/library/1"
            maxFileSize={MAX_FILE_SIZE}
            acceptedFileTypes=".mp3,.wav,.m4a,.mp4,.mov"
            apiEndpoint="/api/v1/lab-deployed/upload-10"
        />
    );
};

export default Lab10Recording;
