import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import axios from '../../../api/axios';
import LabRecordingComponent from '../../MaternalchildRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab12Recording = () => {
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
                const lab12 = response.data.labs.find(lab => lab.labInfo.labNumber === 12);
                if (lab12) {
                    setAttemptsLeft(lab12.attemptsLeft);
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
            navigate('/student/maternalchild12cn');
        } else if (newLanguage === 'en') {
            navigate('/student/maternalchild12en');
        } else if (newLanguage === 'jp') {
            navigate('/student/maternalchild12jp');
        } else if (newLanguage === 'id') {
            navigate('/student/maternalchild12indo');
        }
    };

    return (
        <LabRecordingComponent
            labNumber={12}
            title="สถานการณ์ที่ 12 อาการไม่สุขสบาย (ปวดหลังและตะคริว)"
            subtitle="อาการไม่สุขสบาย (ปวดหลังและตะคริว)"
            description="สตรีตั้งครรภ์อายุ 20 ปี G1P0A0L0 GA 38 week by LMP มาฝากครรภ์ตามนัด ทารกดิ้นดี ให้ประวัติว่ามีอาการปวดหลัง เป็นตะคริว ปัสสาวะบ่อยตอนกลางคืน รู้สึกเจ็บท้องเป็นพักๆ เมื่อนั่งหรือนอนอาการเจ็บท้องก็จะหายไป
            Scene: ณ แผนกฝากครรภ์ พยาบาลซักประวัติสตรีตั้งครรภ์ สอบถามอาการไม่สุขสบายในขณะตั้งครรภ์ช่วงนี้
            "
            questions={[
                "อธิบายสาเหตุของอาการปวดหลังในสตรีตั้งครรภ์และคำแนะนำในการปฏิบัติตัวที่เหมาะสม",
                "อธิบายสาเหตุของการเกิดตะคริวในสตรีตั้งครรภ์และคำแนะนำในการปฏิบัติตัวที่เหมาะสม"
            ]}
            videoSrc="/maternalchild/situation12.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab12Recording;