import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import axios from '../../../api/axios';
import LabRecordingComponent from '../../MaternalchildRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab13Recording = () => {
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
                const lab13 = response.data.labs.find(lab => lab.labInfo.labNumber === 13);
                if (lab13) {
                    setAttemptsLeft(lab13.attemptsLeft);
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
            navigate('/student/maternalchild13cn');
        } else if (newLanguage === 'en') {
            navigate('/student/maternalchild13en');
        } else if (newLanguage === 'jp') {
            navigate('/student/maternalchild13jp');
        } else if (newLanguage === 'id') {
            navigate('/student/maternalchild13indo');
        }
    };

    return (
        <LabRecordingComponent
            labNumber={13}
            title="สถานการณ์ที่ 13 การตรวจครรภ์"
            subtitle="การตรวจครรภ์"
            description="สตรีตั้งครรภ์อายุ 22 ปี G1P0 GA 28 สัปดาห์ มาฝากครรภ์ตามนัด รู้สึกทารกดิ้นดี อาการทั่วไปปกติ
            Scene: ณ แผนกฝากครรภ์ สตรีตั้งครรภ์มาฝากครรภ์ตามนัด อายุ 22 ปี G1P0 GA 28 สัปดาห์ รู้สึกทารกดิ้นดี อาการทั่วไปปกติ ผลการตรวจครรภ์ FH = 27 cm, 2/4 ˃ • ทารกอยู่ในท่า ROP, head float, FHS= 138-156 bpm 
            "
            questions={[
                "อธิบายวัตถุประสงค์ของการตรวจครรภ์",
                "อธิบายผลการตรวจครรภ์และสาธิตการตรวจครรภ์ตามสถานการณ์ที่กำหนด (ครอบคลุมประเด็นการดู การคลำ และการฟัง เพื่อประเมินการเจริญเติบโต ตำแหน่ง และสุขภาพของทารกในครรภ์)"
            ]}
            videoSrc="/maternalchild/situation13.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab13Recording;