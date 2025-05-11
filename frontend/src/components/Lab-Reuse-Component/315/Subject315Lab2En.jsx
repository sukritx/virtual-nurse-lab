import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import axios from '../../../api/axios';
import Subject315EnRecordingComponent from '../../Subject315EnRecordingComponent';

const MAX_ATTEMPTS = 3;

const Subject315Lab2En = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('th');
    const { token } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/315/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab2 = response.data.labs.find(lab => lab.labInfo.labNumber === 2);
                if (lab2) {
                    setAttemptsLeft(lab2.attemptsLeft);
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
            navigate('/student/315/2cn');
        } else if (newLanguage === 'en') {
            navigate('/student/315/2en');
        } else if (newLanguage === 'jp') {
            navigate('/student/315/2jp');
        } else if (newLanguage === 'id') {
            navigate('/student/315/2indo');
        }
    };

    return (
        <Subject315EnRecordingComponent
            labNumber={2}
            title="Provide guidance on perineal wound care"
            subtitle=""
            description="A postpartum woman who delivered vaginally 12 hours ago presents with a third-degree perineal tear, with a REEDA score of 7 (R=2, E=2, Ec=2, D=0, A=1), and reports perineal pain at a severity level of 8. Students are required to provide guidance on perineal wound care, sanitary pad use, and perineal pain management."
            questions={[
                "Perineal Wound Care: (30 points)",
                "Sanitary Pad Use: (30 points)",
                "Perineal Pain Management: (40 points)"
            ]}
            videoSrc=""
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Subject315Lab2En;