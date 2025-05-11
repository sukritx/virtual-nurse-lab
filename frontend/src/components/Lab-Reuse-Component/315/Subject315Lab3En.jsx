import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import axios from '../../../api/axios';
import Subject315EnRecordingComponent from '../../Subject315EnRecordingComponent';

const MAX_ATTEMPTS = 3;

const Subject315Lab3En = () => {
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
                const lab3 = response.data.labs.find(lab => lab.labInfo.labNumber === 3);
                if (lab3) {
                    setAttemptsLeft(lab3.attemptsLeft);
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
            navigate('/student/315/3cn');
        } else if (newLanguage === 'en') {
            navigate('/student/315/3en');
        } else if (newLanguage === 'jp') {
            navigate('/student/315/3jp');
        } else if (newLanguage === 'id') {
            navigate('/student/315/3indo');
        }
    };

    return (
        <Subject315EnRecordingComponent
            labNumber={3}
            title="Assess the LATCH score and provide breastfeeding technique guidance"
            subtitle=""
            description="A postpartum woman 1 day after normal delivery has bilateral nipples measuring 0.5 cm in length, with no milk flow. The mother reports difficulties in breastfeeding, including improper infant latch (not reaching the areola), lack of audible swallowing, improper breastfeeding position, and significant nipple pain. Students are required to assess the LATCH score and provide breastfeeding technique guidance."
            questions={[
                "LATCH Score Assessment: (50 points)",
                "Guidance on Correct Breastfeeding Technique: (50 points)"
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

export default Subject315Lab3En;