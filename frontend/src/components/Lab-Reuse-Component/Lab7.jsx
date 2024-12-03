import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import LabRecordingComponent from '../MaternalchildRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab7Recording = () => {
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
                const lab7 = response.data.labs.find(lab => lab.labInfo.labNumber === 7);
                if (lab7) {
                    setAttemptsLeft(lab7.attemptsLeft);
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
            navigate('/student/upload7cn');
        } else if (newLanguage === 'en') {
            navigate('/student/upload7en');
        } else if (newLanguage === 'jp') {
            navigate('/student/upload7jp');
        }
        // For Thai, we stay on the current page
    };

    return (
        <LabRecordingComponent
            labNumber={7}
            title="Lab 7: การอาบน้ำทารก"
            subtitle=""
            description=""
            questions={[
                "ท่านจะให้คำแนะนำวิธีการอาบน้ำทารกแก่มารดารายนี้อย่างไร (ครอบคลุมประเด็น การสังเกตร่างกายทารกก่อนอาบน้ำ สิ่งแวดล้อมบริเวณที่อาบน้ำ และการเตรียมน้ำอาบทารก)"
            ]}
            videoSrc="/maternalchild/situation7.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
            instructionsLink="/library/1"
        />
    );
};

export default Lab7Recording;