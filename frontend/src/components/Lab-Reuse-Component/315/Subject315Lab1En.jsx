import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import axios from '../../../api/axios';
import Subject315EnRecordingComponent from '../../Subject315EnRecordingComponent';

const MAX_ATTEMPTS = 3;

const Subject315Lab1En = () => {
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
            navigate('/student/315/1cn');
        } else if (newLanguage === 'en') {
            navigate('/student/315/1en');
        } else if (newLanguage === 'jp') {
            navigate('/student/315/1jp');
        } else if (newLanguage === 'id') {
            navigate('/student/315/1indo');
        }
    };

    return (
        <Subject315EnRecordingComponent
            labNumber={1}
            title="Provide guidance to the mother on postpartum uterine changes"
            subtitle=""
            description="A multiparous woman (third pregnancy) who is 2 days postpartum inquires about uterine pain and a palpable mass in the abdominal area. Students are required to provide guidance to the mother on postpartum uterine changes, including uterine involution, uterine descent, and uterine pain."
            questions={[
                "Uterine Involution: (10 points)",
                "Uterine Descent: (50 points)",
                "Uterine Pain: (50 points)"
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

export default Subject315Lab1En;