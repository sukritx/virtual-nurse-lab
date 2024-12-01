import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import LabRecordingComponent from '../LabRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab6Recording = () => {
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
                const lab6 = response.data.labs.find(lab => lab.labInfo.labNumber === 6);
                if (lab6) {
                    setAttemptsLeft(lab6.attemptsLeft);
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
            navigate('/student/upload6cn');
        } else if (newLanguage === 'en') {
            navigate('/student/upload6en');
        } else if (newLanguage === 'jp') {
            navigate('/student/upload6jp');
        }
        // For Thai, we stay on the current page
    };

    return (
        <LabRecordingComponent
            labNumber={6}
            title="Lab 6: การทำความสะอาดแผลฝีเย็บ"
            subtitle=""
            description=""
            questions={[
                "ท่านจะให้คำแนะนำวิธีการทำความสะอาดแผลผีเย็บและเปลี่ยนผ้าอนามัยแก่มารดารายนี้อย่างไร (ครอบคลุมในประเด็น วิธีการเปลี่ยนผ้าอนามัย การทำความสะอาดแผลฝีเย็บ และการสังเกตความผิดปกติของแผลฝีเย็บ)"
            ]}
            videoSrc="/questionVideos/situation6.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
            instructionsLink="/library/1"
        />
    );
};

export default Lab6Recording;