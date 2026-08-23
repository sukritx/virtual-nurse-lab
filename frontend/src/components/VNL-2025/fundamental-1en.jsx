import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import FundamentalRecordingComponent from './FundamentalRecordingComponent';

const MAX_ATTEMPTS = 3;

const Fundamental1En = () => {
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

        if (newLanguage === 'th') {
            navigate('/student/fundamental/1');
        }
    };

    return (
        <FundamentalRecordingComponent
            labNumber={1}
            title="Scenario 1: Nursing Care for a Patient with a Retained Urinary Catheter"
            subtitle=""
            description="Mrs Pranee, a 68-year-old female, is on post-operative day 2 following abdominal surgery. She has a retained Foley catheter (No. 14 Fr) connected to a closed urine drainage bag. Physician's orders: retain Foley catheter; record urine output every 8 hours. During the morning round, the student nurse observes that the urine drainage bag is resting on the bed beside the patient at the same level as her bladder, and the drainage tubing has a visible kink. The urine in the bag is amber and clear, volume 250 mL."
            questions={[
                "From the video, identify what is incorrect in the current set-up of the urinary drainage system, and explain how you would correct each problem, giving your reasons.",
                "Describe the essential nursing care you would provide during your shift to prevent CAUTI and to maintain this patient's urinary catheter safely."
            ]}
            videoSrc="/fundamental/1.%20Fundamental%20Nursing%20—%20Retained%20Urinary%20Catheter.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Fundamental1En;
