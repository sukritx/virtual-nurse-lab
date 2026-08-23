import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import FundamentalRecordingComponent from './FundamentalRecordingComponent';

const MAX_ATTEMPTS = 3;

const Fundamental2En = () => {
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

        if (newLanguage === 'th') {
            navigate('/student/fundamental/2');
        }
    };

    return (
        <FundamentalRecordingComponent
            labNumber={2}
            title="Scenario 2: Nursing Care for a Patient Receiving Intravenous (IV) Fluid Therapy"
            subtitle=""
            description="Mr Somchai, a 45-year-old male, was admitted with acute gastroenteritis and moderate dehydration. Physician's orders: 0.9% NSS 1,000 mL intravenously at 80 mL/hour; record intake and output every 8 hours. He has an IV cannula (No. 22) at his left forearm, inserted 2 days ago, connected to a standard administration set (drop factor 20 drops/mL). The student nurse is assigned to care for him during this shift."
            questions={[
                "Calculate the drip rate in drops per minute for this order, showing your method, and state what you must verify before regulating the infusion.",
                "Describe the essential nursing care for this patient while he is receiving IV fluid therapy, including intake-output recording."
            ]}
            videoSrc="/fundamental/2.%20Fundamental%20Nursing%20IV%20therapy.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Fundamental2En;
