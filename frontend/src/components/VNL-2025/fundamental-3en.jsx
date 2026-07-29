import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import FundamentalRecordingComponent from './FundamentalRecordingComponent';

const MAX_ATTEMPTS = 3;

const Fundamental3En = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('en');
    const { token } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/fundamental/labs', {
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

        if (newLanguage === 'th') {
            navigate('/student/fundamental/3');
        }
    };

    return (
        <FundamentalRecordingComponent
            labNumber={3}
            title="Scenario 3: Nursing Care for a Patient Receiving Nasogastric (NG) Tube Feeding"
            subtitle=""
            description="Mrs Kaew, a 72-year-old female with dysphagia following an ischaemic stroke, is receiving enteral nutrition. Physician's orders: blenderised diet (BD) 300 mL × 4 feeds/day via NG tube; elevate the head of the bed 30-45 degrees during and after feeding. It is now 10:00 and the student nurse is assigned to administer this feed. The NG tube (No. 16 Fr) is in place at the right nostril with the external marking at 55 cm, and the previous feed was given 4 hours ago."
            questions={[
                "Before administering the feed, describe TWO bedside methods to verify that the tip of the NG tube remains correctly positioned in the stomach.",
                "Describe the nursing care before, during, and after administering this enteral feed."
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

export default Fundamental3En;
