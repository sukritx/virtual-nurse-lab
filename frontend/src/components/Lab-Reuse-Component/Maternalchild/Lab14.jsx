import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import axios from '../../../api/axios';
import LabRecordingComponent from '../../MaternalchildRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab14Recording = () => {
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
                const lab14 = response.data.labs.find(lab => lab.labInfo.labNumber === 14);
                if (lab14) {
                    setAttemptsLeft(lab14.attemptsLeft);
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
            navigate('/student/maternalchild14cn');
        } else if (newLanguage === 'en') {
            navigate('/student/maternalchild14en');
        } else if (newLanguage === 'jp') {
            navigate('/student/maternalchild14jp');
        } else if (newLanguage === 'id') {
            navigate('/student/maternalchild14indo');
        }
    };

    return (
        <LabRecordingComponent
            labNumber={14}
            title="สถานการณ์ที่ 14 การตรวจคัดกรองเบาหวาน GCT และ OGTT ในระยะตั้งครรภ์"
            subtitle="คำแนะนำผลตรวจ GCT และ OGTT ในสตรีตั้งครรภ์"
            description="สตรีตั้งครรภ์ อายุ 25 ปี G2P1001 last 2 ปี BMI 29 kg/m2 อายุครรภ์ 24 สัปดาห์ ผลการตรวจ GCT 155 mg/dL, นัดตรวจ OGTT ได้ค่า 100, 195, 170, 140 mg/dl
            Scene: ณ แผนกฝากครรภ์ สตรีตั้งครรภ์ อายุ 25 ปี G2P1001 last 2 ปี BMI 29 kg/m2 อายุครรภ์ 24 สัปดาห์ ผลการตรวจ GCT 155 mg/dL, นัดตรวจวันนี้ OGTT ได้ค่า 100, 195, 170, 140 mg/dl - พยาบาล อธิบายผลของการตรวจ GCT และ OGTT ให้กับสตรีตั้งครรภ์
            "
            questions={[
                "อธิบายผลการตรวจ GCT และ OGTT สำหรับสตรีตั้งครรภ์",
                "แนะนำการปฏิบัติตัวเกี่ยวกับการรับประทานอาหารสำหรับสตรีตั้งครรภ์ที่มีภาวะเบาหวานร่วมกับการตั้งครรภ์"
            ]}
            videoSrc="/maternalchild/situation14.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab14Recording;