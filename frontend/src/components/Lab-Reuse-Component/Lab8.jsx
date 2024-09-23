import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import LabRecordingComponent from '../LabRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab8Recording = () => {
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
                const lab8 = response.data.labs.find(lab => lab.labInfo.labNumber === 8);
                if (lab8) {
                    setAttemptsLeft(lab8.attemptsLeft);
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
            navigate('/student/upload8cn');
        } else if (newLanguage === 'en') {
            navigate('/student/upload8en');
        } else if (newLanguage === 'jp') {
            navigate('/student/upload8jp');
        }
        // For Thai, we stay on the current page
    };

    return (
        <LabRecordingComponent
            labNumber={8}
            title="Lab 8: การทำความสะอาดตาและสายสะดือทารก"
            subtitle=""
            description=""
            questions={[
                "ท่านจะให้คำแนะนำในการทำความสะอาดตาและสายสะดือทารกแก่มารดารายนี้อย่างไร (ครอบคลุมประเด็น การเตรียมอุปกรณ์ และขั้นตอนการทำความสะอาดตาและสายสะดือ)"
            ]}
            videoSrc="/questionVideos/situation8.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
            instructionsLink="/library/1"
        />
    );
};

export default Lab8Recording;