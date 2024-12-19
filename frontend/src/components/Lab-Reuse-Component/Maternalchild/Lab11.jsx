import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import axios from '../../../api/axios';
import LabRecordingComponent from '../../MaternalchildRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab11Recording = () => {
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
                const lab11 = response.data.labs.find(lab => lab.labInfo.labNumber === 11);
                if (lab11) {
                    setAttemptsLeft(lab11.attemptsLeft);
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
            navigate('/student/maternalchild11cn');
        } else if (newLanguage === 'en') {
            navigate('/student/maternalchild11en');
        } else if (newLanguage === 'jp') {
            navigate('/student/maternalchild11jp');
        } else if (newLanguage === 'id') {
            navigate('/student/maternalchild11indo');
        }
    };

    return (
        <LabRecordingComponent
            labNumber={11}
            title="สถานการณ์ที่ 11 การประเมินในระยะตั้งครรภ์ (Initial Prenatal Assessment)"
            subtitle="Initial Prenatal Assessment"
            description="สตรีตั้งครรภ์อายุ 36 ปี G2 P1001 last 2 ปี อายุครรภ์ 18 สัปดาห์ ผลการตรวจทางห้องปฏิบัติการ พบ Hct 30%, Hb 9.2 gm/dL, urine albumin: negative, urine sugar: negative, MCV 68 fl, DCIP negative ผลการคัดกรอง Down’s syndrome 1: 500 สตรีตั้งครรภ์ให้ข้อมูลว่า ช่วงนี้มีอาการคลื่นไส้อาเจียน และมีเลือดออกตามไรฟันเล็กน้อย อีกทั้งยังมีความกังวลเกี่ยวกับสุขภาพของทารกในครรภ์ กลัวทารกไม่ปกติเพราะตนเองตั้งครรภ์ตอนอายุมากแล้ว
            Scene: ณ แผนกฝากครรภ์ สตรีตั้งครรภ์มาฝากครรภ์ตามนัด และฟังผลการตรวจทางห้องปฏิบัติการ 
            - พยาบาลให้ข้อมูลผลการตรวจทางห้องปฏิบัติการ ได้แก่ Hct 30%, Hb 9.2 gm/dL, urine albumin: negative, urine sugar: negative, MCV 68 fl, DCIP negative 
            - สตรีตั้งครรภ์ ให้ข้อมูลว่า ช่วงนี้มีอาการคลื่นไส้อาเจียน และมีเลือดออกตามไรฟัน พยาบาลบอกสาเหตุและให้คำแนะนำในการปฏิบัติตัว
            - สตรีตั้งครรภ์ บอกว่า มีความกังวลเกี่ยวกับสุขภาพของทารกในครรภ์ กลัวทารกไม่ปกติเพราะตนเองตั้งครรภ์อายุมากแล้ว พยาบาลจึงแนะนำให้ตรวจคัดกรองดาวน์ซินโดรม
            "
            questions={[
                "อธิบายผลการตรวจปัสสาวะและการตรวจเลือดในหญิงตั้งครรภ์รายนี้",
                "อธิบายสาเหตุและแนวทางการปฏิบัติตัวเมื่อมีอาการคลื่นไส้อาเจียนและเลือดออกตามไรฟันในระหว่างตั้งครรภ์ "
            ]}
            videoSrc="/maternalchild/situation11.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab11Recording;