import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import axios from '../../../api/axios';
import LabRecordingComponent from '../../MaternalchildRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab15Recording = () => {
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
                const lab15 = response.data.labs.find(lab => lab.labInfo.labNumber === 15);
                if (lab15) {
                    setAttemptsLeft(lab15.attemptsLeft);
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
            navigate('/student/maternalchild15cn');
        } else if (newLanguage === 'en') {
            navigate('/student/maternalchild15en');
        } else if (newLanguage === 'jp') {
            navigate('/student/maternalchild15jp');
        } else if (newLanguage === 'id') {
            navigate('/student/maternalchild15indo');
        }
    };

    return (
        <LabRecordingComponent
            labNumber={15}
            title="สถานการณ์ที่ 5 การบริหารร่างกายในระยะตั้งครรภ์"
            subtitle="คำแนะนำการบริหารร่างกายในระยะตั้งครรภ์"
            description="สตรีตั้งครรภ์ อายุ 25 ปี G1P0 อายุครรภ์ 32 สัปดาห์ มาฝากครรภ์ตามนัด มีอาการเท้าบวมเล็กน้อย ปวดหลังและบริเวณตะโพก มีความตั้งใจที่จะคลอดเองทางช่องคลอด แต่กังวลว่าจะคลอดเองไม่ได้
            Scene: ณ แผนกฝากครรภ์ สตรีตั้งครรภ์ อายุ 25 ปี G1P0 อายุครรภ์ 32 สัปดาห์ มาฝากครรภ์ตามนัด บ่นเท้าบวม ปวดหลังและบริเวณตะโพก ขอคำแนะนำจากพยาบาลในการบริหารร่างกายที่ช่วยลดอาการเท้าบวมและปวดหลัง และส่งเสริมการคลอดง่าย และให้ข้อมูลเพิ่มเติมว่า สตรีตั้งครรภ์มีความตั้งใจที่จะคลอดเองทางช่องคลอด แต่กังวลว่าจะคลอดเองไม่ได้ สอบถามพยาบาลเพิ่มเติมเกี่ยวกับการช่วยให้คลอดเองได้ง่าย
            "
            questions={[
                "อธิบายประโยชน์และข้อห้ามในการบริหารร่างกายสำหรับสตรีตั้งครรภ์",
                "อธิบายและสาธิตท่าบริหารร่างกายสำหรับสตรีตั้งครรภ์"
            ]}
            videoSrc="/maternalchild/situation15.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab15Recording;