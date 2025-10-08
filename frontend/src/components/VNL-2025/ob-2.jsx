// ob-2.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import LabRecordingComponent from './OBRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab2Recording = () => {
    const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS);
    const [language, setLanguage] = useState('th');
    const { token } = useAuth(); // Still need token for API calls for logged-in users
    const navigate = useNavigate();

    useEffect(() => {
        // Since this page is now behind a PrivateRoute, we know the user is logged in.
        const fetchLabInfo = async () => {
            try {
                const response = await axios.get('/api/v1/student/ob/labs', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const lab2 = response.data.labs.find(lab => lab.labInfo.labNumber === 2);
                if (lab2) {
                    setAttemptsLeft(lab2.attemptsLeft);
                }
            } catch (error) {
                console.error('Error fetching lab info:', error);
                // Optionally handle errors, e.g., by navigating away or showing an error message
                // If a 401/403 error occurs here, PrivateRoute should have already handled it,
                // but you might want specific error handling for API failures.
            }
        };
        fetchLabInfo();
    }, [token]); // token is the only dependency needed now

    const handleLanguageChange = (event) => {
        const newLanguage = event.target.value;
        setLanguage(newLanguage);
        
        if (newLanguage === 'zh') {
            navigate('/ob/cn');
        } else if (newLanguage === 'en') {
            navigate('/ob/en');
        } else if (newLanguage === 'jp') {
            navigate('/ob/jp');
        } else if (newLanguage === 'id') {
            navigate('/ob/id');
        }
    };

    const handleSignupClick = () => {
        navigate('/signup');
    };

    return (
        <LabRecordingComponent
            labNumber={2}
            title="สถานการณ์ที่2: การตรวจครรภ์"
            subtitle="การตรวจครรภ์"
            description="
            สตรีตั้งครรภ์อายุ 22 ปี G1P0 GA 28 สัปดาห์ มาฝากครรภ์ตามนัด รู้สึกทารกดิ้นดี อาการทั่วไปปกติ
            Scene: ณ แผนกฝากครรภ์ สตรีตั้งครรภ์มาฝากครรภ์ตามนัด อายุ 22 ปี G1P0 GA 28 สัปดาห์ รู้สึกทารกดิ้นดี อาการทั่วไปปกติ ผลการตรวจครรภ์ FH = 27 cm, 2/4 ˃ • ทารกอยู่ในท่า ROP, head float, FHS= 138-156 bpm 
            "
            questions={[
                "อธิบายวัตถุประสงค์ของการตรวจครรภ์",
                "อธิบายผลการตรวจครรภ์และสาธิตการตรวจครรภ์ตามสถานการณ์ที่กำหนด (ครอบคลุมประเด็นการดู การคลำ และการฟัง เพื่อประเมินการเจริญเติบโต ตำแหน่ง และสุขภาพของทารกในครรภ์)"
            ]}
            videoSrc="/ob/ob2.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab2Recording;