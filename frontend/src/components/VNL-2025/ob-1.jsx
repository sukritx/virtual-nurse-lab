// ob-1.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from '../../api/axios';
import LabRecordingComponent from './SurgicalRecordingComponent';

const MAX_ATTEMPTS = 3;

const Lab1Recording = () => {
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
                const lab1 = response.data.labs.find(lab => lab.labInfo.labNumber === 1);
                if (lab1) {
                    setAttemptsLeft(lab1.attemptsLeft);
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
            labNumber={1}
            title="สถานการณ์ที่1: การประเมินในระยะตั้งครรภ์"
            subtitle="Initial Prenatal Assessment"
            description="
            สตรีตั้งครรภ์อายุ 36 ปี G2 P1001 last 2 ปี อายุครรภ์ 18 สัปดาห์ ผลการตรวจทางห้องปฏิบัติการ พบ Hct 30%, Hb 9.2 gm/dL, urine albumin: negative, urine sugar: negative, MCV 68 fl, DCIP negative ผลการคัดกรอง Down’s syndrome 1: 500 สตรีตั้งครรภ์ให้ข้อมูลว่า ช่วงนี้มีอาการคลื่นไส้อาเจียน และมีเลือดออกตามไรฟันเล็กน้อย อีกทั้งยังมีความกังวลเกี่ยวกับสุขภาพของทารกในครรภ์ กลัวทารกไม่ปกติเพราะตนเองตั้งครรภ์ตอนอายุมากแล้ว
            Scene: ณ แผนกฝากครรภ์ สตรีตั้งครรภ์มาฝากครรภ์ตามนัด และฟังผลการตรวจทางห้องปฏิบัติการ 
            - พยาบาลให้ข้อมูลผลการตรวจทางห้องปฏิบัติการ ได้แก่ Hct 30%, Hb 9.2 gm/dL, urine albumin: negative, urine sugar: negative, MCV 68 fl, DCIP negative 
            - สตรีตั้งครรภ์ ให้ข้อมูลว่า ช่วงนี้มีอาการคลื่นไส้อาเจียน และมีเลือดออกตามไรฟัน พยาบาลบอกสาเหตุและให้คำแนะนำในการปฏิบัติตัว
            - สตรีตั้งครรภ์ บอกว่า มีความกังวลเกี่ยวกับสุขภาพของทารกในครรภ์ กลัวทารกไม่ปกติเพราะตนเองตั้งครรภ์อายุมากแล้ว พยาบาลจึงแนะนำให้ตรวจคัดกรองดาวน์ซินโดรม
            "
            questions={[
                "อธิบายผลการตรวจปัสสาวะและการตรวจเลือดในหญิงตั้งครรภ์รายนี้",
                "อธิบายสาเหตุและแนวทางการปฏิบัติตัวเมื่อมีอาการคลื่นไส้อาเจียนและเลือดออกตามไรฟันในระหว่างตั้งครรภ์"
            ]}
            videoSrc="/ob/ob1.mp4"
            attemptsLeft={attemptsLeft}
            setAttemptsLeft={setAttemptsLeft}
            language={language}
            setLanguage={setLanguage}
            onLanguageChange={handleLanguageChange}
        />
    );
};

export default Lab1Recording;